function requestText(text, targets = []) {
  // Generated target wrappers must not override the user's real request.
  return [text.split(/^局部修改｜/m)[0], ...targets.map(t => t.request || '')].filter(Boolean).join('\n');
}
function deliveryIntent(text, targets = []) {
  const request = requestText(text, targets);
  const keepRequest = request.replace(/(?:不要|不用|无需|别|不)覆盖(?:当前|原有|现有)?(?:模型|工程|版本|原件)/g, '');
  const keepVersion = /(?:不(?:要|用|必|需(?:要)?)?|别|无需)\s*(?:再|另外)?\s*(?:新增|新建|增加|创建|另存(?:为)?|改(?:变|动)?|修改|更改|变更|升级|升)?\s*(?:一[个份]|当前|这个|这一版的|新)?\s*版本(?:号)?|(?:版本(?:号)?)(?:保持)?(?:不变|不改|不动)|(?:保留|保持)(?:当前|原有|现有|原)?版本(?:号)?|原版修改|原地修改|就地修改|不升版|不要升版|覆盖(?:当前|原有|现有)(?:版本|模型|工程)/i.test(keepRequest);
  const discussion = /(?:先|只|仅)(?:是|要|需|需要)?\s*(?:讨论|解释|说明|分析|检查|看看)|(?:不要|不必|无需|先不)(?:实际)?(?:执行|制作)(?:任何)?(?:操作|任务|文件)|不创建文件/i.test(request);
  const skipRender = /(?:不要|无需|不用|暂不|不必|不需要|先不|不)[^，,。！？;\n]{0,3}(?:渲染|成图|出图|\brender\b)/i.test(request);
  const render = /渲染|成图|出图|\brender\b/i.test(request) && !skipRender;
  const renderOnly = render && (/(?:只|仅|单独|补|重新)(?:需要|要|做|给|进行|一下)?\s*(?:渲染|成图|出图)|不(?:要)?(?:改|修改|改变|动)(?:模型|建模|结构|几何)/i.test(request) || !targets.length && !/(?:修改|改成|改为|变成|调整|增加|添加|删除|移除|替换|放大|缩小|旋转|移动|建模|新建|创建|搭建|制作)/i.test(request));
  const edit = targets.length > 0 || /修改|改成|改为|变成|调整|增加|添加|删除|移除|替换|建模|新建|创建|搭建|制作|另存|升版|生成.{0,6}(?:模型|结构)/i.test(request);
  return { request, keepVersion, discussion, render, skipRender, operation: discussion ? null : renderOnly ? 'render_only' : edit || render ? 'model_edit' : null, continuation: /^(?:好[的吧]?|可以|继续|开始|就按|确认|(?:我选|选择|选|就用|用|使用)?\s*(?:blender|c4d|cinema))/i.test(request.trim()), forceRevision: !keepVersion && /另存.{0,8}(?:新版本|v\d+)|(?:新建|创建|新增)一?个?新版本|(?:新建|创建)v\d+/i.test(request) };
}
module.exports = { deliveryIntent, requestText };
