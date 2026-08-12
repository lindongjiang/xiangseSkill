# StandarReader 2.56.1 修改样本静态逆向基线

更新时间：`2026-07-05`  
适用范围：`/Users/mantou/Documents/idea/xiangseSkill` 的静态兼容性参考；不作为官方 App 运行证明

## 0. 仓内修改样本（非官方运行验收件）

`Tg@TrollstoreKios.app` 含注入/修改组件。以下结论只能证明该样本中存在相应字符串、符号或资源，不能外推为官方未修改 App 的内置能力，也不能替代 live 网络链或官方 App 导入/运行/编辑保存验证。

- App 包：`Tg@TrollstoreKios.app/`
- 主二进制：`Tg@TrollstoreKios.app/Tg@TrollstoreKios`（Mach-O arm64）
- 显示名：`香色闺阁Plus`（`CFBundleDisplayName`）
- 内部名：`StandarReader`（`CFBundleName`）
- 版本：`2.56.1`（`CFBundleShortVersionString` / `CFBundleVersion`）
- Bundle ID：`com.appbox.StandarReader0.7V6RKTCVR2.T43C7793Q3`
- 书源导入类型：`xsreader.config.xbs`（扩展名 `.xbs`），同族还有 `.xts`（排版）、`.xms`（主题）
- 编辑器字段元数据：`Tg@TrollstoreKios.app/lpnet_modelInfo`（XBS，可用 `tools/scripts/decode_xbs.py` 解包）

复现命令（本仓路径）：

```bash
plutil -p Tg@TrollstoreKios.app/Info.plist
strings Tg@TrollstoreKios.app/Tg@TrollstoreKios | rg "actionID|parserID|requestInfo|webView"
python3 tools/scripts/decode_xbs.py Tg@TrollstoreKios.app/lpnet_modelInfo
```

## 1. 证据来源与分级

主证据文件（3.3 逆向产物）：

- `/Users/mantou/Documents/idea/3.3/analysis/standarreader_2.56.1_reverse_ground_truth.md`
- `/Users/mantou/Documents/idea/3.3/analysis/standarreader_2.56.1_reverse_summary.json`
- `/Users/mantou/Documents/idea/3.3/analysis/reverse_inventory.md`
- `/Users/mantou/Documents/idea/3.3/analysis/hook_inventory.json`
- `/Users/mantou/Documents/idea/3.3/analysis/reverse_class_methods.json`

证据分级：

- `样本静态确认`：可由这个修改样本的二进制符号、字符串或可解析配置直接复现；不代表官方 App 运行时确认。
- `高可信推断`：多处证据一致，但无单点强制约束证明。
- `待动态验证`：静态层无法确定运行时是否强制执行。

## 2. SDK / 内置 Tools 清单（并入后基线）

### 2.1 系统链接库（修改样本静态确认）

关键依赖（节选）：

- `Foundation/UIKit/WebKit/JavaScriptCore/SystemConfiguration/Security`
- `CoreFoundation/CoreGraphics/CoreImage/CoreMedia/CoreText/QuartzCore`
- `libsqlite3/libxml2/libz/libiconv`
- 注入链相关：`MikeCrack.dylib`、`Tg@TrollstoreKios.dylib`、`Tg@TrollstoreMios.dylib`、`SideloadMikepass1.dylib`、`SideloadMikepass2.dylib`

### 2.2 Pods 组件（修改样本静态确认）

- `AFNetworking`
- `FMDB`
- `MJRefresh`
- `SDWebImage` / `SDWebImageWebPCoder`
- `SSZipArchive`
- `XMLDictionary`
- `Masonry`
- `MBProgressHUD`
- `VIMediaCache`

### 2.3 业务工具类与职责映射

- `LCJSTool`：JS 侧工具能力（XPath、AES/Base64、Cookie、文件、日志）。
- `DomModelParser`：规则执行核心（requestInfo 组装、response 解析、DOM/JSONPath 取值）。
- `LPNetWork1/LPNetWork2`：请求层与响应处理（序列化、缓存键、回调格式化、HTML 清洗）。
- `BookQueryManager`：动作路由（search/detail/chapter/content）与结果回传。
- `BookSourceManager`：多源并发调度、失败/空结果管理、搜索生命周期控制。

结论：`xiangseSkill` 的动作骨架和字段模型（`actionID/parserID/requestInfo/responseFormatType/moreKeys`）与该修改样本的静态链路一致；官方 App 仍需单独运行验证。

## 3. 规则引擎真值表（lpnet_modelInfo 基线）

`lpnet_modelInfo` 可配置键（修改样本静态确认）：

- `actionID`
- `moreKeys`
- `requestFunction`
- `requestJavascript`
- `requestParamsEncode`
- `responseDecryptType`
- `responseEncode`
- `responseFormatType`
- `responseFunction`
- `responseJavascript`
- `testConfig`
- `testRegex`

### 3.1 responseFormatType（修改样本静态确认）

- `""`（普通字符串）
- `base64str`
- `html`
- `xml`
- `json`
- `data`

### 3.2 responseDecryptType（修改样本静态确认）

- `""`（无需解密）
- `encryptType1`

### 3.3 其他编码枚举（修改样本静态确认）

- `requestParamsEncode`：`""(utf-8)`、`2147485234(gbk)`
- `responseEncode`：`""(utf-8)`、`2147485232(gb2312)`、`2147485234(gbk)`

### 3.4 占位符（修改样本静态确认）

- `%@result`
- `%@keyWord`
- `%@pageIndex`
- `%@offset`
- `%@filter`

### 3.5 样本统计（391 份 sourceModelList 快照）

- `parserID`：`DOM 3448`、`JS 56`
- `responseFormatType`：`html 1067`、`json 256`、`"" 2`、`xml 1`
- `bookWorld` 结构：`named_category_map 391`
- `weight` 类型：`str 388`、`int 3`
- `enable` 类型：`int 378`、`str 10`、`bool 3`

## 4. 加解密能力边界

### 4.1 修改样本原生层（静态确认）

- CommonCrypto：`_CCCrypt/_CCCryptorCreate/_CCCryptorUpdate`
- 摘要：`_CC_MD5/_CC_SHA1`
- `LCJSTool dataByAesDecryptWithBase64String:withKey:withIv:`
- `LCJSTool base64Encode:/base64Decode:`

### 4.2 修改样本资源层（不得外推为官方规则运行时）

- `crypto.min.js` 存在
- 该文件中可识别 `AES/DES/TripleDES/RC4/Rabbit/MD5/SHA1/SHA256` 实现
- 文件存在不证明官方 App 包含该资源，也不证明书源 `@js`/JSParser 上下文自动暴露 `CryptoJS` 或 `atob`
- 新书源不得把 CryptoJS 当作官方内置能力；只有目标官方 App 的实际运行验证才能建立站点专项依赖

### 4.3 修改样本元数据中的可配置入口（静态确认）

- 当前仅见：`responseDecryptType=encryptType1`

结论：

- 修改样本存在 AES/MD5/SHA1/Base64 相关符号，但不能据此承诺官方规则上下文可直接调用。
- 更复杂解密只有在 live 与官方 App 都得到非空明文后才能判定通过；否则为 `blocked/fail`。

## 5. Hook / 注入链与可疑点

### 5.1 修改样本注入链（静态确认）

- 主程序直链：`MikeCrack.dylib`、`Tg@TrollstoreKios.dylib`、`Tg@TrollstoreMios.dylib`、`SideloadMikepass1/2.dylib`
- 相关依赖：`libsubstrate.dylib`、`libsubstitute.dylib`

### 5.2 可疑 Hook 点（修改样本静态确认）

- `_MSHookClassPair`
- `_MSHookFunction`
- `_MSHookMessageEx`
- `_substitute_hook_objc_message`
- `_substitute_hook_functions`
- `_substitute_dlopen_in_pid`
- `sandbox_check`

### 5.3 可疑 URL（修改样本静态确认）

- `https://commonconfig.oss-accelerate.aliyuncs.com/xsreader/xsreader.2.56.0`
- `https://www.baidu.com/s?word=%@`
- `https://itunes.apple.com/app/id%@`
- `https://audio_test.mp3`
- `https://video_test.mp4`
- `http://vjs.zencdn.net/v/oceans.mp4`
- `http://f3.htqyy.com/play9/5/mp3/6`
- `https://commonres.cdn.bcebos.com/normal/404.jpeg`

注：远程 `xsreader` 对象是否存在二次解密链，当前归类 `待动态验证`。

## 6. 与 xiangseSkill 规则主张对照矩阵

| ID | 规则主张 | 结论 | 处理建议 | 证据 |
|---|---|---|---|---|
| C01 | 四核心动作必须存在（search/detail/list/content） | 确认 | 保持硬约束 | E08 |
| C02 | `bookWorld` 使用分类 map（非数组） | 确认 | 保持硬约束 | E12 |
| C03 | `weight` 必须字符串 | 需放宽 | 改为归一化建议 + 警告 | E09 |
| C04 | `enable` 必须整型 1/0 | 需放宽 | 改为归一化建议 + 警告 | E09 |
| C05 | 旧主张包含非法值 `text` | 已纠正 | 合法值为 `""/base64str/html/xml/json/data` | E05,E10 |
| C06 | `responseDecryptType` 支持 `encryptType1` | 确认 | 加入枚举白名单 | E05,E04 |
| C07 | 禁止 `method:/data:/headers:/java.getParams()` | 需分级 | `java.getParams` 仍错误；其余默认警告，可 strict 升级为错误 | E12 |
| C08 | 支持 `%@result/%@keyWord/%@pageIndex/%@offset/%@filter` | 确认 | 在规范文档明确保留 | E04 |
| C09 | `chapterContent.nextPageUrl` 必须同章守卫 | 待动态验证 | 继续作为强实践建议，不作为静态硬错误 | E11 |
| C10 | `requestInfo` 优先 `@js:` | 高可信推断 | 保持推荐项，不做硬挡 | E10 |

矩阵汇总：

- `确认`：动作骨架、bookWorld map、占位符、`encryptType1`
- `需放宽`：`weight/enable` 输入多态
- `需补充`：`responseFormatType`、`responseDecryptType` 枚举
- `待动态验证`：`nextPageUrl` 同章守卫是否客户端强制

## 7. 复现命令与证据编号

- E01：`otool -L Tg@TrollstoreKios`
- E02：`strings | rg PodsDummy_`
- E03：`nm -u | rg CCCrypt|CC_MD5|CC_SHA1`
- E04：`strings | rg actionID|parserID|requestInfo|responseFormatType|...`
- E05：`xbs_tool.py xbs2json -i lpnet_modelInfo -o /tmp/lpnet_modelInfo.json`
- E06：`nm -gU Tg@TrollstoreMios.dylib | rg MSHook|sandbox`
- E07：`nm -gU libsubstrate.dylib | rg MSHook|substitute_hook`
- E08-E12：`/private/tmp/sourceModelList.from_xbs.json` 统计结论

推荐直接使用 `/Users/mantou/Documents/idea/3.3/analysis/standarreader_2.56.1_reverse_summary.json` 作为机器可读证据索引。

## 8. 2026-07-05 复扫增量（仓内修改样本 `Tg@TrollstoreKios.app`）

### 8.1 新增/补全字段

| 字段 | 结论 | skill 处理 |
|---|---|---|
| `webViewSkipUrlsUnless` | 主二进制字符串存在；为 skip 规则白名单覆盖 | 写入 WebView 基线与 workflow skill |
| `webViewSniff` | 存在；配套 `arrWebViewSniff`、`canLoadUrl:fromSniff:` | 标注为高级选项，默认优先 HTTP/API |
| `wkwebview_post` | WebView 内置 form POST 辅助函数 | 挑战页/登录页二次提交可用 |
| `loginUrl` / `loginWebView` | 登录动作链路存在 | 仅登录型站点按需配置 |
| `miniAppVersion` | 顶层可选字段（历史源常见） | 交付可不写；写了也不阻断 |

## 9. 2026-08-11 复扫增量（`lpnet_modelInfo` 字段白名单 + 官方导出样本）

### 9.1 编辑器动作面板字段白名单（`Tg@TrollstoreKios.app/lpnet_modelInfo`）

`lpnet_modelInfo` 是编辑器"动作面板"的字段元数据（XBS，`decode_xbs.py` 可解包），即官方 UI 暴露的可配置动作字段全集：

- `requestJavascript`（获取请求信息的js代码）——UI 形式；保存产物即 `requestInfo`
- `responseJavascript`（解析响应的js代码）
- `requestFunction` / `responseFunction`（对应 JS parser 方法名）
- `requestParamsEncode`（""=utf-8 / `2147485234`=gbk）
- `responseEncode`（""=utf-8 / `2147485232`=gb2312 / `2147485234`=gbk）
- `responseFormatType`（""/`base64str`/`html`/`xml`/`json`/`data`）
- `responseDecryptType`（""/`encryptType1`）
- `moreKeys`（NSDictionary）
- `actionID`（`kv_editable: false`，不可编辑）
- `testConfig` / `testRegex`（UI 测试工具字段，交付可省略）

### 9.2 编码字段枚举（静态确认）

- `requestParamsEncode`：`""(utf-8)`、`2147485234(gbk)`
- `responseEncode`：`""(utf-8)`、`2147485232(gb2312)`、`2147485234(gbk)`

`check_xiangse_schema.py` 已按此白名单校验；`tools/validator` 已支持 `responseEncode` 的 gbk/gb2312 响应解码（TextDecoder，零依赖），`requestParamsEncode=gbk` 的 POST 参数编码尚未支持并输出结构化 unsupported。

### 9.3 官方导出样本证据（`tools/verification/mac_live_sourceModelList.json`）

App 实际导出的 6 份书源（精华书阁/80zw小说/酷读一世/百度小说/ttks.tw/雪飞阁）确认：

- `bookWorld.*.moreKeys.requestFilters` 全部为字符串 legacy 形式（`key\n标题::值\n...`），非数组
- 动作级 `host` 字段普遍存在（`config.host` 的来源）
- `params` 运行时成员包含：`keyWord/pageIndex/filters.<key>/queryInfo/responseUrl/lastResponse/requestInfo`
- `requestInfo` JS 返回对象可含 `responseFormatType` 覆盖键（百度小说：`return {url:result,responseFormatType:'data'}`）
- `bookWorld` 子项可含 `_sIndex` 排序索引
- `weight` 多态：官方样本中字符串为主（`"109"`/`"666"`/`"9999"`/`"1573"`），亦有数字（精华书阁 `100`）——skill 保持字符串硬约束为编辑保存安全选择（见 `RETROSPECT_LOG` 2026-03-10 事故）

### 9.4 JS 运行时签名（主二进制字符串）

- `function functionName(config, params, result){` — `@js:` 规则被包装执行的函数签名，与契约一致
- `function buildRegex(strSource, strRegex)` — 内置正则工具
- `%@wkwebview_post("%@", "%@", %@)` 完整函数源码位于主二进制字符串
- `sourceTypeByEmoji:` / `sourceTypeBySourceName:` — 源类型推导辅助

### 9.5 复现命令

```bash
python3 tools/scripts/decode_xbs.py "Tg@TrollstoreKios.app/lpnet_modelInfo"
strings "Tg@TrollstoreKios.app/Tg@TrollstoreKios" | rg "functionName\(config|bookWorldTemplate|webViewForbidUrls|parserParams"
```

## 10. 2026-08-11 复扫增量（ObjC 类方法全集 + 官方导出样本统计）

### 10.1 LCJSTool 完整 API（`LCJSToolExports` JSExport 协议，修改样本静态确认）

`LCJSTool` 通过 `LCJSToolExports`（JSExport）暴露给 JS 运行时，调用名去掉冒号转驼峰。官方导出样本（百度小说）中的调用形式为 `params.nativeTool.<method>`：

- `log:` / `log:withKey:` — 日志
- `stringByObject:` — 对象转字符串
- `deviceId` / `deviceIdWithTemplate:withSeparator:`
- `base64Encode:` / `base64EncodeWithData:` / `base64Decode:`
- `sha1Encode:` / `md5Encode:`
- `cookieByKey:` / `cookiesByUrl:`
- `getCache:` / `set:cache:`
- `readFile:` / `readTxtFile:` / `allFilesAtPath:`
- `unzipFile:` / `unzipFile:withPassword:`
- `dataByAesDecryptWithData:withKey:withIv:` / `dataByAesDecryptWithBase64Data:withKey:withIv:` / `dataByAesDecryptWithBase64String:withKey:withIv:`
- `XPathParserWithSource:`

注意：这些方法存在并 JSExport 于修改样本；官方未修改 App 的 JS 上下文是否暴露 `params.nativeTool` 仍需官方 App 运行验证（保持 fail-closed）。

### 10.2 DomModelParser 解析链路（静态确认）

- `getRequestInfoForConfig:parserParams:error:` — requestInfo 求值（占位符替换 + `@js:` 执行）
- `getResponseInfoForResponse:config:userInfo:error:` — 响应转换（解密/编码后对象）
- `parse1:config:userInfo:` / `parse2:config:userInfo:dontRmHtmlKeys:` — 两阶段解析（parse2 剥离 HTML）
- `parseNormalNode:config:userInfo:dontRmHtmlKeys:` — 列表项解析
- `valueForNode:config:rule:ruleKey:userInfo:removeHtml:` — 单字段求值（rule=表达式、ruleKey=字段名）
- `valueForNode:jsonPath:` — JSONPath 求值（SMJJSONPath 库，前缀 `$`，`smjJsonPathPrefix`）
- `divisionRule:withSplit:` — 分割规则求值（未在交付样本中确认字段名，待动态验证）
- `dicNormalRuleKey` / `dicCheckConfigValidKey` / `dicUpgradeKey211031`（2021-10-31 旧模型升级映射）

### 10.3 BookQueryManager / LPNetWork1 / LPNetWork2 请求链（静态确认）

- `queryByActionID:book:queryInfo:sourceName:userInfo:target:notify:cachePolicy:` — 统一查询入口（book=胖书对象、queryInfo=上一步选中项）
- `queryCatalogByBook:sourceName:...:` / `queryCpFileByBook:cpInfo:cpIndex:...:` — 目录/漫画章节专项
- `getDefaultHttpHeaders` / `useHttpHeader` / `dicCacheTime` / `getCacheTime:`
- `getCacheKeyByConfig:requestInfo:` — 请求缓存键
- `getCustomFormatHttpParams:paramsEncode:post:` — 请求参数编码实现点（requestParamsEncode 的 gbk 路径在此）
- `getFullUrlByHost:url:` — 相对 URL 拼接（与 validator `resolveWithHost` 同语义）
- `removeHtml:fromKey:userInfo:` / `removeHtml:regex:cacheRegex:` / `defRemoveHtmlRegex` — 字段 HTML 清洗（对应 `moreKeys.removeHtmlKeys`）
- `formatCallBackResponse:config:userInfo:` / `checkParserResponse:` — 响应格式化与校验

### 10.4 BookSourceModelManager 模板字典（静态确认，值待动态）

- `dicBaseModelTemplateDom` / `dicBaseModelTemplateJS` — 新建书源基础模板（DOM/JS 两套）
- `dicBookWorldTemplateDom` / `dicBookWorldTemplateJS` — 分类模板
- `dicShudanListTemplateDom` / `dicShudanListTemplateJS` — 书单模板
- `dicDomModelKeyInfo` / `dicDomModelEditableKeys:` — DOM 字段元数据/可编辑键
- `dicSourceModelKeyInfo` / `dicSourceModelEditableKeys` / `dicSourceModelSyncConfig` — 源级字段元数据
- 字典值不可静态读取，需 Frida 动态 dump（`tools/scripts/frida_dommodel_trace.js` 已就绪）

### 10.5 官方导出样本统计结论（`tools/verification/mac_live_sourceModelList.json`，6 源）

- 动作级字段频次：`actionID/parserID` 34/34（必含）；`responseFormatType` 23、`validConfig` 21、`requestInfo` 20、`host` 17、`httpHeaders` 13、`list` 12；解析字段：`detailUrl/title/cover/url/desc/nextPageUrl/content/cat/author/bookName/lastChapterTitle/status`
- **`sourceType` 缺失合法**：百度小说无 `sourceType`（App 默认按 text）。契约仍要求显式 `sourceType=text`（fail-closed 交付原则）
- **空动作合法**：`shudanList: {}`（完全空）、`shupingList/relatedWord/searchShudan/shudanDetail/shupingHome` 为 `{actionID, parserID}` 空壳（百度小说/雪飞阁）
- **`lastModifyTime` 支持浮点字符串**：官方 3/6 为 `"1773148185.456299"` 形式
- **`weight` 多态复核**：str 5/6、int 1/6（精华书阁 `100`）；契约字符串硬约束为编辑保存安全选择（见 2026-03-10 事故）
- **`enable`**：官方全部 int 0/1 ✓
- **`miniAppVersion`**：官方 6/6 均带（如 `"2.53.2"`，历史版本源在 2.56.1 兼容）
- 特殊动作（书评/书单/相关词/热搜）仅在需要时配置，可省略

### 10.6 剩余知识缺口（必须动态验证）

| 缺口 | 方法 |
|---|---|
| `dicDomModelKeyInfo`/模板字典值 | Frida dump `BookSourceModelManager` 实例属性 |
| `encryptType1` 具体算法参数（AES 模式/填充） | Frida 观测 `dataByAesDecryptWith...` 入参 |
| gbk 参数编码实现细节 | 反汇编 `getCustomFormatHttpParams:paramsEncode:post:` |
| 缓存键格式 | 反汇编/动态观测 `getCacheKeyByConfig:requestInfo:` |
| `divisionRule` 字段名与格式 | 官方 App 编辑面板实测 |
| `params.nativeTool` 官方可用性 | 官方 App JS 上下文实测 |

### 8.2 解析类与调用链（静态符号）

- `DomModelParser`
  - `getRequestInfoForConfig:parserParams:error:`
  - `valueForNode:config:rule:ruleKey:userInfo:removeHtml:`
  - `valueForNode:jsonPath:`
- `BookQueryManager`
  - `queryByActionID:book:queryInfo:sourceName:userInfo:target:notify:cachePolicy:`
- `LPNetWork2`
  - `startWithUrl:requestInfo:config:userInfo:`
  - `requestWithUrl:requestInfo:config:userInfo:`
- `LCJSTool`
  - `base64Encode:` / `base64Decode:`
  - `md5Encode:` / `sha1Encode:`
  - `dataByAesDecryptWithBase64String:withKey:withIv:`
  - `cookieByKey:` / `searchWithXPathQuery:`

### 8.3 内置模板与远程配置

- 包内引用：`sourceModelList.xbs`、`xsBookSource.xbs`、`sourceModelTemplate`
- 远程对象：`https://commonconfig.oss-accelerate.aliyuncs.com/xsreader/xsreader.2.56.0`
  - 可下载，但不是标准 XBS 长度对齐格式；不要把它当书源模板直接解包

### 8.4 skill 同步清单（本次已完成）

- `skills/local/xiangse-booksource.SKILL.md`：新增「IPA 逆向基线」整节
- `skills/global/xbs-booksource-workflow.SKILL.md`：新增 IPA 真值表 + WebView 键补全
- `docs/REVERSE_WEBVIEW_BASELINE_2561.md`：补 `webViewSkipUrlsUnless` / `webViewSniff` / `wkwebview_post`
- `tools/scripts/decode_xbs.py`：Go 工具不可用时的 XBS 解包回退

### 8.5 动态验证执行结果（2026-07-05）

执行报告：`tools/verification/VERIFICATION_RUN_2026-07-05.json`

| 项目 | 结果 | 说明 |
|---|---|---|
| IPA 静态基线核对 | PASS | `python3 tools/scripts/verify_ipa_baseline.py` |
| `lpnet_modelInfo` 解包 | PASS | 枚举与 skill 一致 |
| 四步 fixture 模拟 | PARSER PASS | 样本源 `雪飞阁` + `tools/verification/fixtures/xuefeige/`；仅解析单测，不证明 URL 导航或 App 运行 |
| 四步 live 模拟 | FAIL | 目标站 TLS/网络不可用（环境限制，非 parser 逻辑错误） |
| Python XBS 往返 | PASS | `decode_xbs.py --encode` 生成 `xuefeige_fixed.xbs` 并可回解 |
| Frida 动态 Hook | SKIPPED | 当前无 USB iOS 设备；脚本已就绪：`tools/scripts/frida_dommodel_trace.js` |

本报告没有完成来源明确、未修改的官方 StandarReader 2.56.1 App 验收，因此不得用于输出最终 `pass`。

本轮修复：

- `xbs_tool.py`：`simulate-fixture --fixtures` 改为传绝对路径（修复相对路径在 validator cwd 下找不到 fixture）
- `decode_xbs.py`：新增 `--encode`，在 macOS `go run` 因 `dyld LC_UUID` 崩溃时仍可 json2xbs

复现命令：

```bash
python3 tools/scripts/verify_ipa_baseline.py
python3 tools/scripts/xbs_tool.py simulate-fixture \
  -i tools/verification/xuefeige_fixed.json \
  --fixtures tools/verification/fixtures/xuefeige \
  --report tools/verification/xuefeige_fixed.fixture.simulate.json
python3 tools/scripts/decode_xbs.py --encode tools/verification/xuefeige_fixed.json tools/verification/xuefeige_fixed.xbs
```
