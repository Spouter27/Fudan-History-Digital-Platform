> 2026-09-16更新：业务接口已在backend实现，认证当前采用本地密码账号（/auth/login），邮件验证码仍为后续规划。所有写请求增加X-App-Request: fudan-history及受信任Origin校验，实际运行约定见[后端手册](../../backend/README.md)。

# 后端接口约定

此文档描述已经实现的 HttpRepository 所期待的协议。它是待实现的接口，不表示服务已经存在。类型和校验以 src/model.ts 为准。

## 通用协议

- Base URL：/api，可通过 VITE_API_BASE_URL 配置。
- Content-Type：application/json。
- fetch 使用 credentials: include；建议同源、服务端会话 + HttpOnly Cookie。
- 成功返回 HTTP 200 和 {"code":0,"message":"ok","data":...}。
- 即使删除成功也返回 data:null 的上述JSON包，不要返回204空响应。
- 未登录401、权限不足403、不存在404、重复审核或状态冲突409、字段无效422、超限429。
- 失败使用非2xx状态；不要把业务失败藏在200响应中。
- 当前前端对401、403有单独提示，其他状态显示通用错误。后续可扩展安全的字段错误协议。
- 请求15秒超时；失败不回退到演示数据。

## 接口清单

| 方法 | 路径 | 权限与行为 | data |
| --- | --- | --- | --- |
| GET | /catalog | 游客；仅返回已允许公开的正式条目 | Catalog |
| GET | /submissions?scope=mine | 登录；仅当前用户自己的投稿 | Submission[] |
| GET | /submissions?scope=review | 审核员；待审与已处理队列 | Submission[] |
| GET | /submissions?scope=public | 游客；仅approved、未撤回、允许展示的记录 | Submission[] |
| POST | /submissions | 登录；验证授权、字段、频率；服务端设置owner和pending | Submission |
| POST | /submissions/:id/approve | 审核员；仅pending可通过 | null |
| POST | /submissions/:id/reject | 审核员；仅pending可退回，note不可空 | null |
| POST | /submissions/:id/withdraw | 所有者；撤回并停止展示 | null |
| DELETE | /submissions/:id | 所有者；删除正文，按政策保留匿名审核摘要 | null |

审核/撤回POST请求体为 {"note":"审核意见"}，撤回时前端发送空note。服务端限制note最多500字。

目前采用一次加载小规模目录、前端过滤和分页的方式。数据增大后另建 /search、/events 等分页接口，并同步改前端，不能仅改服务器返回结构。

## Catalog结构

~~~json
{
  "events": [{
    "id": "event-001",
    "year": 1905,
    "title": "由内容组填写的事件标题",
    "category": "学校沿革",
    "summary": "经核实的短摘要",
    "content": "经核实并允许展示的正文",
    "place": "地点文字",
    "sourceIds": ["source-001"],
    "personIds": ["person-001"],
    "demo": false
  }],
  "people": [{
    "id": "person-001",
    "name": "经核实的人物姓名",
    "role": "教育工作者",
    "years": "经核实的年代说明",
    "summary": "人物介绍",
    "sourceIds": ["source-001"],
    "x": 320,
    "y": 195,
    "demo": false
  }],
  "relations": [{
    "id": "relation-001",
    "from": "person-001",
    "to": "person-002",
    "type": "学术合作",
    "sourceIds": ["source-001"],
    "demo": false
  }],
  "sources": [{
    "id": "source-001",
    "title": "实际史料标题",
    "kind": "档案",
    "citation": "机构、全称、日期、页码或档号",
    "excerpt": "允许公开的摘录",
    "authorization": "已授权",
    "url": "https://example.org/replace-with-verified-source",
    "demo": false
  }]
}
~~~

上例用于解释字段，person-002也必须实际出现在people数组中；example.org仅为文档占位符，不得作为真实来源入库。

枚举：
- category：学校沿革 / 学术教育 / 校园生活。
- role：教育工作者 / 学者 / 学生（目前单一展示分类；多重身份后续扩展）。
- type：师生 / 同窗 / 学术合作 / 社团协作。
- kind：档案 / 报刊 / 口述。
- authorization：演示资料 / 已授权 / 可依法引用。后两项必须先由内容负责人确认依据。
- 每个event/person/relation必须有至少一个有效sourceId，所有关联必须指向本次返回的实体。
- url可省略，前端仅渲染http/https链接。
- x/y是前端初始布局坐标，建议x=50..730、y=55..470。可由服务端适配层计算，不必存为史学事实。
- year是时间轴索引。只有“约某年”或日期范围时，建议将代表年放在year，同时在标题/正文写明不确定性；正式版本应新增 dateStart/dateEnd/precision 并调整UI。
- 原型只展示1905—2026范围。需要扩大范围时修改App.tsx中的periods。

生产catalog必须过滤未授权/待审/不公开资料，不能将它们发送到浏览器后依靠隐藏组件保护。正式事件至少关联一份可展示来源；移除来源后同步更新依赖的事件和关系，避免悬空引用。

## 投稿字段

POST /submissions请求：

~~~json
{
  "title": "一段校园记忆",
  "year": 2026,
  "body": "至少20字且不超过2000字的内容正文，不能只填写空白。",
  "author": "展示笔名",
  "consent": true
}
~~~

校验：title trim后4—60字；year为1905至当前年份的整数；body trim后20—2000字；author trim后1—24字；consent必须true。

Submission返回上述字段，并增加：

~~~json
{
  "id": "服务端生成的UUID",
  "status": "pending",
  "createdAt": "2026-09-15T12:00:00.000Z",
  "updatedAt": "2026-09-15T12:00:00.000Z",
  "reviewNote": ""
}
~~~

status取pending / approved / rejected / withdrawn。时间使用ISO 8601字符串；后端另存ownerId，严禁采信前端传入的owner/role/status。author只是公开署名，不是身份标识。公开接口不返回邮箱、内部审核人员或隐私审查备注，reviewNote可返回空字符串。

状态转换：
- 新建 → pending。
- pending → approved 或 rejected。
- pending/approved/rejected → withdrawn。
- withdrawn不可再次通过或重复撤回。
- 目前退回后通过新投稿重新提交；将来若实现原条目编辑，修改后必须重新回到pending。
- 审核与撤回使用事务和状态条件更新，防止旧页面的审核请求重新公开已撤回记录。

## 需要另外实现的登录接口

这部分尚无对应前端页面：
1. POST /auth/email-code：发送一次性验证码，限流、过期、避免枚举账号。
2. POST /auth/verify：验证邮箱归属，建立服务端会话。
3. GET /auth/me：返回当前用户公开信息和角色。
4. POST /auth/logout：注销会话。

登录页面与Header登录状态接好后，未登录投稿跳转登录并保留草稿；不要通过地址参数、localStorage角色字符串或邮箱后缀直接授予审核权限。
