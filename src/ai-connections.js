export function setupAIConnections({onSaved}) {
  const $=id=>document.getElementById(id),api=window.workbench,dialog=$('ai-connections-dialog');
  let config={apis:[],local:{}},saving=false,testing=false,ticket=0;
  const errorText=error=>String(error.message || error).replace(/^Error invoking remote method '[^']+': Error: /,'');
  const status=(text,error=false)=>{const node=$('ai-config-status');node.textContent=text;node.classList.toggle('error',error);};
  function controls(){
    $('ai-api-fields').disabled=$('ai-connection-kind').value!=='api'||saving||testing;
    $('ai-local-fields').disabled=$('ai-connection-kind').value!=='local'||saving||testing;
    $('ai-api-fields').hidden=$('ai-connection-kind').value!=='api';$('ai-local-fields').hidden=$('ai-connection-kind').value!=='local';
    for(const id of ['ai-connection-kind','ai-config-save','ai-config-remove'])$(id).disabled=saving||testing;
    $('ai-config-save').textContent=saving?'正在保存…':'保存并连接';
    const apiMode=$('ai-connection-kind').value==='api',id=apiMode?$('ai-api-profile').value:$('ai-local-type').value;
    $('ai-config-remove').hidden=apiMode?!id:!config.local[id];$('ai-config-remove').textContent=apiMode?'删除此连接':'恢复自动检测';
  }
  function apiValue(){return {id:$('ai-api-profile').value || undefined,name:$('ai-api-name').value.trim(),baseURL:$('ai-api-url').value.trim(),key:$('ai-api-key').value.trim(),clearKey:$('ai-api-clear-key').checked,model:$('ai-api-model').value.trim(),localTools:$('ai-api-tools').checked};}
  function populateAPI(){
    const row=config.apis.find(p=>p.id===$('ai-api-profile').value);$('ai-api-name').value=row?.name || '';$('ai-api-url').value=row?.baseURL || '';$('ai-api-model').value=row?.model || '';
    $('ai-api-key').value='';$('ai-api-key').placeholder=row?.hasKey?'已保存密钥；留空保持不变':'填写 API Key；本地服务可留空';$('ai-api-clear-key').checked=false;$('ai-api-tools').checked=row?.localTools || false;
    $('ai-model-options').replaceChildren();status('');controls();
  }
  function populateLocal(){const row=config.local[$('ai-local-type').value];$('ai-local-path').value=row?.executable || '';$('ai-local-args').value=JSON.stringify(row?.prefixArgs || []);status(row?'已保存手动路径，可修改或恢复自动检测。':'未设置手动路径；不影响现有自动检测。');controls();}
  async function open(){
    if(saving)return;const token=++ticket;status('正在读取配置…');
    try{const value=await api.aiConfig();if(token!==ticket)return;config=value;
      $('ai-api-profile').replaceChildren(new Option('新增 API 连接',''),...config.apis.map(p=>new Option(p.name,p.id)));
      const current=window.workbenchChatState?.().agent;if(config.apis.some(p=>p.id===current)){$('ai-api-profile').value=current;$('ai-connection-kind').value='api';}else{$('ai-connection-kind').value='api';if(config.local[current])$('ai-local-type').value=current;}
      populateAPI();if(!dialog.open)dialog.showModal();$('ai-connection-kind').focus();
    }catch(error){status(errorText(error),true);if(!dialog.open)dialog.showModal();}
  }
  for(const id of ['open-ai-connections','settings-ai-connections'])$(id).addEventListener('click',open);
  $('ai-connection-kind').addEventListener('change',()=>{$('ai-connection-kind').value==='api'?populateAPI():populateLocal();});
  $('ai-api-profile').addEventListener('change',populateAPI);$('ai-local-type').addEventListener('change',populateLocal);
  $('ai-local-browse').addEventListener('click',async()=>{try{const file=await api.chooseAIProgram();if(file)$('ai-local-path').value=file;}catch(error){status(errorText(error),true);}});
  $('ai-api-test').addEventListener('click',async()=>{
    const token=++ticket;testing=true;controls();status('正在读取模型列表…');
    try{const result=await api.testAPIConnection(apiValue());if(token!==ticket)return;$('ai-model-options').replaceChildren(...result.models.map(m=>new Option(m.name,m.model)));if(!$('ai-api-model').value)$('ai-api-model').value=result.models[0]?.model || '';status(`已读取 ${result.models.length} 个模型，可在模型 ID 中选择或手填。`);}
    catch(error){if(token===ticket)status(errorText(error),true);}finally{if(token===ticket){testing=false;controls();}}
  });
  $('ai-config-form').addEventListener('submit',async event=>{
    event.preventDefault();if(saving||testing)return;saving=true;controls();status('');
    try{
      let saved;
      if($('ai-connection-kind').value==='api')saved=await api.saveAPIConnection(apiValue());
      else{let args;try{args=JSON.parse($('ai-local-args').value || '[]');}catch{throw new Error('启动参数须为 JSON 数组，例如 [] 或 ["脚本完整路径"]');}saved=await api.saveLocalConnection({id:$('ai-local-type').value,executable:$('ai-local-path').value.trim(),prefixArgs:args});}
      saving=false;dialog.close();await onSaved(saved.id);
    }catch(error){status(errorText(error),true);}finally{saving=false;controls();}
  });
  $('ai-config-remove').addEventListener('click',async()=>{
    if(saving||testing)return;const id=$('ai-connection-kind').value==='api'?$('ai-api-profile').value:$('ai-local-type').value;if(!id)return;
    saving=true;controls();status('');try{await api.removeAIConnection(id);saving=false;dialog.close();await onSaved();}catch(error){status(errorText(error),true);}finally{saving=false;controls();}
  });
  $('close-ai-connections').addEventListener('click',()=>{if(!saving)dialog.close();});$('ai-config-cancel').addEventListener('click',()=>{if(!saving)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(saving){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  dialog.addEventListener('close',()=>{ticket++;testing=false;$('ai-api-key').value='';controls();});
}
