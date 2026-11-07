# C组接口契约 v1.1（冻结）

> 本契约是 `frontend/docs/API约定.md` 中“数据增大后另建 /search、/events 等分页接口，并同步改前端”的具体实现。Catalog 结构、枚举值、统一响应格式与 `API约定.md` 逐字段一致；新增接口为下一阶段分页/筛选版本，前端按需切换，现有 `/api/catalog` 全量模式继续可用。

统一响应：`{"code":0,"message":"ok","data":...}`
错误：HTTP 4xx/5xx + `{"code":非0,"message":"...","data":null}`

所有只读接口游客可访问，不需要登录。

## 错误码表

| HTTP | code | 场景 |
|---|---|---|
| 400 | 400 | JSON 格式错误 |
| 401 | 401 | 未登录或会话过期（需登录接口） |
| 403 | 403 | 权限不足、来源校验失败或缺少 X-App-Request |
| 404 | 404 | 事件/人物不存在，或接口不存在 |
| 409 | 409 | 状态冲突（如重复审核已处理记录） |
| 422 | 422 | 参数校验失败 |
| 429 | 429 | 请求过于频繁 |

---

## 1. 时间轴列表

`GET /api/timeline`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| page | number | 1 | 页码，从 1 开始 |
| pageSize | number | 20 | 每页条数，最大 100 |
| start | number | — | 起始年份（含），如 1905 |
| end | number | — | 结束年份（含） |
| category | string | — | 类别：学校沿革 / 学术教育 / 校园生活 |
| keyword | string | — | 在 title + summary 中模糊匹配 |

返回 `data`：

```json
{
  "total": 12,
  "page": 1,
  "pageSize": 5,
  "items": [
    {
      "id": "e1",
      "year": 1905,
      "title": "从一份求学记忆开始",
      "category": "学校沿革",
      "summary": "...",
      "content": "...",
      "place": "早期校园",
      "sourceIds": ["s1"],
      "personIds": ["p1", "p6"],
      "demo": true
    }
  ]
}
```

---

## 2. 时间轴详情

`GET /api/timeline/:id`

返回 `data`：单条事件对象，字段同上。不存在时：`404 {"code":404,"message":"事件不存在。","data":null}`。

---

## 3. 人物列表

`GET /api/persons`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| page | number | 1 | 页码，从 1 开始 |
| pageSize | number | 20 | 每页条数，最大 100 |
| role | string | — | 身份：教育工作者 / 学者 / 学生 |
| keyword | string | — | 在 name + summary 中模糊匹配 |

返回 `data`：

```json
{
  "total": 8,
  "page": 1,
  "pageSize": 5,
  "items": [
    {
      "id": "p1",
      "name": "江知远",
      "role": "教育工作者",
      "years": "演示人物 A",
      "summary": "...",
      "sourceIds": ["s1"],
      "x": 320,
      "y": 195,
      "demo": true
    }
  ]
}
```

---

## 4. 人物详情

`GET /api/persons/:id`

返回 `data`：人物对象 + 两个派生字段。

```json
{
  "id": "p1",
  "name": "江知远",
  "role": "教育工作者",
  "years": "演示人物 A",
  "summary": "...",
  "sourceIds": ["s1"],
  "x": 320,
  "y": 195,
  "demo": true,
  "relatedEvents": [
    { "id": "e1", "year": 1905, "title": "从一份求学记忆开始", "category": "学校沿革" }
  ],
  "relations": [
    {
      "id": "r1",
      "type": "师生",
      "from": "p1",
      "to": "p2",
      "otherId": "p2",
      "sourceRef": "s1"
    }
  ]
}
```

- `relatedEvents`：人物参与的事件轻量字段。
- `relations`：人物作为 from 或 to 的关系；`otherId` 是另一端人物 id。
- 不存在时：`404 {"code":404,"message":"人物不存在。","data":null}`。

---

## 5. 关系图

`GET /api/relations/graph`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| centerId | string | — | 人物 id，指定后只返回该人物周围子图 |
| depth | number | 1 | 展开层数，1—5，仅 centerId 存在时生效 |

返回 `data`：

```json
{
  "nodes": [
    { "id": "p1", "name": "江知远", "category": "教育工作者", "colorKey": "教育工作者" }
  ],
  "links": [
    {
      "id": "r1",
      "source": "p1",
      "target": "p2",
      "type": "师生",
      "styleKey": "师生",
      "sourceRef": "s1"
    }
  ]
}
```

- 不传 `centerId`：返回全量。
- 传 `centerId` 但人物不存在：`404 {"code":404,"message":"人物不存在。","data":null}`。
- `depth` 越大节点越多，但不超过全量。

---

## 6. 搜索

`GET /api/search`

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| q | string | 必填 | 关键词，最长 100 |
| page | number | 1 | 页码 |
| pageSize | number | 10 | 每页条数，最大 100 |
| type | string | all | `all` / `event` / `person` / `source` |

返回 `data`：

```json
{
  "total": 10,
  "page": 1,
  "pageSize": 10,
  "items": [
    {
      "id": "e1",
      "type": "event",
      "title": "从一份求学记忆开始",
      "summary": "...",
      "label": "事件",
      "highlight": "早期<em>校园</em>",
      "jumpType": "timeline",
      "jumpId": "e1"
    }
  ]
}
```

### 搜索高亮规则

1. 关键词命中 `title`：高亮标题。
2. 标题未命中、但命中 `summary`：高亮摘要片段。
3. 都未命中：返回原 `title`，不含 `<em>`。

---

## 使用约定

### 分页参数
所有分页接口统一用 `page` + `pageSize`：`page` 从 1 开始，`pageSize` 默认 20（搜索默认 10），最大 100。返回 `total`、`page`、`pageSize`、`items`。不使用 cursor 分页。

### 高亮安全
前端若用 `v-html` 渲染 `highlight`，正式版需转义防 XSS。

### 关系图格式
`/api/relations/graph` 返回 D3 友好的 `nodes/links`：`nodes` 的 `category` 由人物 `role` 映射；`links` 的 `source/target` 由关系 `from/to` 映射。前端 `Graph.tsx` 当前吃 `people/relations`，接此接口时需加适配函数，C 组接口不改。

---

## 与 B 组 `API约定.md` 的对齐状态及差异声明

（针对之前《给B组的接口契约对齐报告》中的“待补”和“需约定”项，作出最终声明）

- **Catalog 结构、枚举值、统一响应**：逐字段一致，无需调整。
- **错误码**：报告称“C组文档待补 401/403/409”。**声明：本文件上方已补齐，双方保持一致。**
- **分页参数**：报告称“需约定”。**声明：本文件已统一约定 `page/pageSize`，以此为准。**
- **搜索高亮**：报告称“需约定”。**声明：本文件已明确后端返回含 `<em>` 的 `highlight`，前端直接用。**
- **关系图格式**：报告称“需适配”。**声明：C组输出 D3 格式，由 B 组在 `Graph.tsx` 中做适配。**
- **认证状态**：报告称“需标注”。**声明：邮箱验证码/SSO 不在本轮，继续用开发账号。**

---

## 冻结声明

本契约自 v1.1 起冻结。字段、错误码、分页参数、高亮格式、关系图结构不再变更。后续如需变更，走“变更流程”。

## 变更流程

1. **提出**：任何一方发现需要变更，在群里提出，说明“改什么、为什么、影响哪些页面”。
2. **评审**：C 组评估后端改动量，B 组评估前端改动量，负责人在群里确认“改还是不改”。
3. **通知**：确认要改，C 组先改契约文档、升版本号、commit，群里 @B组 和负责人；B 组同步改 `API约定.md`。
4. **双方确认**：B 组和 C 组在群里各回一句“确认 v1.x”，变更生效。
5. **不改接口的情况**：纯文案、注释、示例修正，不升版本号，但仍在变更记录表里记一行。

## 版本号规则

- **v1.0**：初始版本。
- **v1.x**（x≥1）：字段新增、错误码新增、使用约定补充，不破坏现有前端调用。
- **v2.0**：字段删除、字段改名、返回结构变化、错误码语义变化，需要 B 组同步改代码。

## 变更记录表

| 版本 | 日期 | 变更内容 | 提出方 | 确认方 |
|---|---|---|---|---|
| v1.0 | 2026-10-25 | 初始版本：timeline 接口 | C 组 | B 组 |
| v1.1 | 2026-10-25 | 补充 relations/graph 和 search 高亮 | C 组 | 未确认 |
| v1.1 | 2026-11-01 | 补全所有接口详情、错误码、对齐状态、冻结声明及治理流程，正式冻结 | C 组 | 待 B 组确认 |
