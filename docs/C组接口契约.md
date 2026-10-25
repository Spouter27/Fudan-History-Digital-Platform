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

