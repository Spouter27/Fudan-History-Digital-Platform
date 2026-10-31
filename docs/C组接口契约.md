\# C组接口契约 v1.0



统一响应：`{"code":0,"message":"ok","data":...}`  

错误：HTTP 4xx/5xx + `{"code":非0,"message":"...","data":null}`



所有只读接口游客可访问，不需要登录。



\---



\## 1. 时间轴列表



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

&#x20; "total": 12,

&#x20; "page": 1,

&#x20; "pageSize": 5,

&#x20; "items": \[

&#x20;   {

&#x20;     "id": "e1",

&#x20;     "year": 1905,

&#x20;     "title": "从一份求学记忆开始",

&#x20;     "category": "学校沿革",

&#x20;     "summary": "...",

&#x20;     "content": "...",

&#x20;     "place": "早期校园",

&#x20;     "sourceIds": \["s1"],

&#x20;     "personIds": \["p1", "p6"],

&#x20;     "demo": true

&#x20;   }

&#x20; ]

}


---

## 补充说明（v1.1）

### 关系图支持中心子图

`GET /api/relations/graph` 新增两个可选参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| centerId | string | — | 人物 id，指定后只返回该人物周围子图 |
| depth | number | 1 | 展开层数，1—5，仅 centerId 存在时生效 |

- 不传 `centerId`：返回全量 `nodes/links`。
- 传 `centerId` 但人物不存在：`404 {"code":404,"message":"人物不存在。","data":null}`。
- `depth` 越大节点越多，但不超过全量。
- 示例：`GET /api/relations/graph?centerId=p1&depth=2`

### 搜索高亮可能来自摘要

`GET /api/search` 的 `highlight` 字段规则：

1. 关键词命中 `title`：高亮标题。
2. 标题未命中、但命中 `summary`：高亮摘要片段。
3. 都未命中：返回原 `title`，不含 `<em>`。

前端若用 `v-html` 渲染 `highlight`，正式版需转义防 XSS；展示版可先接受。
