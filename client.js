/* Prebuilt native dsh client factory. React is supplied by the dsh module table. */
window.__ModuleLoader__.load({ id: 'dsh-document-evidence', factory: require => {
  const { createElement: h, useEffect, useState, useRef } = require('react')
  const { createPortal } = require('react-dom')
  const LIBRARY = 'dsh-document-evidence/library'
  const PDF = 'dsh-document-evidence/pdf'
  const labels = { pending: '等待索引', indexing: '正在索引', interrupted: '已中断', needs_vision: '文字完成 · 视觉待处理', ready: '已完成', failed: '处理失败' }
  const styles = `.de-tool{border:1px solid var(--dsw-alias-border-l2,#8883);border-radius:8px;padding:10px 12px;margin:6px 0;font:var(--dsw-font-sm-13,13px/1.5 var(--dsw-font-family,system-ui));overflow-wrap:anywhere}.de-tool summary,.de-index-trace summary{cursor:pointer}.de-tool button{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3,#8885);border-radius:5px;padding:3px 8px;cursor:pointer}.de-tool p{margin:6px 0}.de-tool .de-hit{padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#8882)}.de-index-trace{margin:8px 0;font-size:12px}.de-index-trace ol{padding-left:22px;border-left:2px solid var(--dsw-alias-border-l2,#8883)}.de-index-trace li{padding:5px 0}.de-tool button:focus-visible,.de-tool summary:focus-visible,.de-index-trace summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#2563eb);outline-offset:3px}.de-panel{height:100%;overflow:auto;padding:18px;color:inherit;font:var(--dsw-font-sm-13,14px/1.55 var(--dsw-font-family,system-ui));box-sizing:border-box}.de-panel *{box-sizing:border-box}.de-panel h2{font-size:18px;margin:0 0 8px}.de-panel h3{font-size:14px;margin:20px 0 8px}.de-panel p{margin:7px 0}.de-muted{color:var(--dsw-alias-label-secondary,inherit);font-size:12px}.de-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.de-row.spread{justify-content:space-between}.de-panel button,.de-panel input{font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l3,#8886);border-radius:6px;padding:5px 9px}.de-panel button{cursor:pointer}.de-panel button:hover{background:var(--dsw-alias-border-l1,#8882)}.de-panel button:disabled{opacity:.45;cursor:default}.de-panel button.de-primary{background:var(--dsw-alias-state-business-primary,#2563eb);color:white;border-color:var(--dsw-alias-state-business-primary,#2563eb)}.de-card{padding:12px 0;border-bottom:1px solid var(--dsw-alias-border-l2,#8883)}.de-card label{display:flex;gap:8px;align-items:flex-start}.de-card strong{overflow-wrap:anywhere}.de-card progress,.de-document-detail progress{display:block;width:100%;height:6px;margin:10px 0;accent-color:var(--dsw-alias-state-business-primary,#2563eb)}.de-error{color:#c34436;overflow-wrap:anywhere}.de-page{position:relative;line-height:0;background:white;box-shadow:0 2px 12px #0002;margin:12px auto}.de-page img{display:block;width:100%}.de-region{position:absolute;background:#ffd43b66;outline:1px solid #e8a600;pointer-events:none}.de-toolbar{position:sticky;top:-18px;padding:10px 0;z-index:2;background:var(--dsw-alias-bg-base,Canvas)}.de-toolbar input{width:64px}.de-quote{border-left:3px solid #e8a600;padding:6px 10px;font-size:12px}.de-empty{padding:30px 0}.de-view-scroll{overflow:auto}.de-error[role=alert]{padding:8px;border:1px solid #c3443644;border-radius:6px}`
  const nativeStyles = `.de-panel,.de-tool{color:var(--dsw-alias-label-primary,inherit)}.de-panel summary,.de-tool summary{cursor:pointer;padding:5px 0}.de-panel button:hover,.de-tool button:hover{background:var(--dsw-alias-interactive-bg-hover-solid,#8882)}.de-tabs{display:flex;gap:6px;margin:12px 0;flex-wrap:wrap}.de-panel button[aria-pressed=true],.de-tool button[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover-solid,#8882);border-color:var(--dsw-alias-label-secondary,currentColor)}.de-tree{list-style:none;padding-left:14px;border-left:1px solid var(--dsw-alias-border-l2,#8883)}.de-tree li{margin:6px 0}.de-tree button{text-align:left;max-width:100%;white-space:normal}.de-page-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:6px;padding:8px 0}.de-stages{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:8px 20px;padding-left:20px;margin:12px 0}.de-stages li{padding:2px 0}.de-selected{border-left:2px solid var(--dsw-alias-border-l3,#8885);padding:10px 12px;margin:12px 0}.de-selected p{white-space:pre-wrap;overflow-wrap:anywhere}.de-structure{margin:10px 0}.de-panel button:focus-visible,.de-panel summary:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,Highlight);outline-offset:2px}`
  const libraryStyles = `.de-library-entry{display:inline-flex;align-items:center;justify-content:center;height:26px;padding:5px 10px;gap:5px;border:.5px solid var(--dsw-alias-border-l4,#8885);border-radius:13px;color:var(--dsw-alias-label-primary,inherit);background:transparent;font-family:var(--dsw-font-family,inherit);font-size:11px;font-weight:400;line-height:16px;cursor:pointer;box-sizing:border-box;white-space:nowrap}.de-library-entry:hover{background:var(--dsw-alias-interactive-bg-hover,#8882)}.de-library-entry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,Highlight);outline-offset:2px}.de-library-count{border-left:1px solid var(--dsw-alias-border-l2,#8883);padding-left:6px;color:var(--dsw-alias-label-secondary,inherit)}.de-file-list{margin:16px 0}.de-file-row{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#8882)}.de-file-row input{flex:none}.de-panel .de-file-select{flex:1;min-width:0;text-align:left;display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid transparent;border-radius:8px}.de-file-select strong{font-weight:500;overflow-wrap:anywhere}.de-file-select span{font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}.de-document-detail{padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#8883)}.de-section-title{font-size:12px;color:var(--dsw-alias-label-secondary,inherit);margin:16px 0 8px}.de-library-heading{margin-bottom:4px}.de-pending{margin-top:18px}.de-file-search{width:100%;box-sizing:border-box}.de-library-status{font-size:12px;margin:6px 0 14px;color:var(--dsw-alias-label-secondary,inherit)}`
  const stages = { start: '开始 / 复用已有索引', text: '文字批次完成', vision_start: '读取视觉页', vision: '视觉页卡已保存', summary_start: '生成文档摘要', summary: '摘要已保存', summary_failed: '摘要不可用', ready: '索引完成', needs_vision: '文字完成，仍有视觉缺口', interrupted: '已中断，可继续', failed: '索引失败' }
  function IndexTrace({ events = [] }) {
    return h('details', { className: 'de-index-trace' },
      h('summary', null, `索引过程 · ${events.length ? '最近 ' + events.length + ' 条' : '暂无历史记录'}`),
      events.length ? h('ol', null, events.map((event, i) => h('li', { key: i },
        h('strong', null, stages[event.stage] ?? event.stage),
        h('div', { className: 'de-muted' }, `${new Date(event.at).toLocaleString('zh-CN', { hour12: false })} · 文字 ${event.indexedPages}/${event.totalPages} 页 · 视觉 ${event.visualNotedPages} 页${event.page ? ' · 当前 p.' + event.page : ''}`))))
        : h('p', { className: 'de-muted' }, '旧索引可继续复用；过程记录从安装本版本后开始。'))
  }
  function PageGroup({doc, start, openPage}) {
    const [expanded,setExpanded] = useState(false)
    const end=Math.min(start+24,doc.coverage.totalPages)
    return h('details',{onToggle:e=>setExpanded(e.currentTarget.open)},h('summary',null,`第 ${start}–${end} 页`),expanded && h('div',{className:'de-page-grid'},Array.from({length:end-start+1},(_,i)=>{
      const page=start+i, gap=doc.coverage.unreadLowTextPages.includes(page)
      return h('button',{key:page,type:'button',onClick:()=>openPage(page),'aria-label':`物理第 ${page} 页${gap?'，视觉待处理':''}`,title:page>doc.coverage.indexedPages?'尚未索引':gap?'文字较少，视觉待处理':'文字已索引'},`${page}${gap?' *':''}`)
    })))
  }
  function DocumentStructure({doc,openPage}) {
    const [view,setView] = useState('tree')
    const roots=[],stack=[]
    for(const entry of doc.outline ?? []) {
      const [level,title,page]=entry
      if(!Number.isInteger(level)||level<1)continue
      const node={title,page,children:[]}
      while(stack.length && stack.at(-1).level>=level)stack.pop()
      ;(stack.length?stack.at(-1).node.children:roots).push(node);stack.push({level,node})
    }
    const renderNodes=nodes=>h('ul',{className:'de-tree'},nodes.map((node,i)=>h('li',{key:i},node.children.length
      ?h('details',null,h('summary',null,node.title),Number.isInteger(node.page)&&node.page>0&&node.page<=doc.coverage.totalPages&&h('button',{onClick:()=>openPage(node.page)},`打开第 ${node.page} 页`),renderNodes(node.children))
      :h('button',{disabled:!Number.isInteger(node.page)||node.page<1||node.page>doc.coverage.totalPages,onClick:()=>openPage(node.page)},`${node.title} · p.${node.page}`))))
    return h('details',{className:'de-structure'},h('summary',null,'目录与建立过程'),
      h('div',{className:'de-tabs',role:'group','aria-label':'目录视图'},h('button',{'aria-pressed':view==='tree',onClick:()=>setView('tree')},'目录 / 页面'),h('button',{'aria-pressed':view==='index',onClick:()=>setView('index')},'索引建立')),
      view==='tree'?h('div',null,
        h('details',{open:true},h('summary',null,`PDF 书签 · ${doc.outline?.length??0} 条`),roots.length?renderNodes(roots):h('p',{className:'de-muted'},'原文件没有书签目录；尚未生成语义章节树。')),
        h('details',null,h('summary',null,`页面索引 · ${doc.coverage.indexedPages} / ${doc.coverage.totalPages} 页`),h('p',{className:'de-muted'},'按物理页分组，点击打开原文；* 表示视觉待处理。'),Array.from({length:Math.ceil(doc.coverage.totalPages/25)},(_,i)=>h(PageGroup,{key:i,doc,start:i*25+1,openPage}))))
        :h('div',null,h('ol',{className:'de-stages'},h('li',null,'PDF 快照已保存'),h('li',null,`读取书签 · ${doc.outline?.length??0} 条`),h('li',null,`文字页索引 · ${doc.coverage.indexedPages}/${doc.coverage.totalPages}`),h('li',null,`视觉页卡 · ${doc.coverage.visualNotedPages} 页完成 / ${doc.coverage.unreadLowTextPages.length} 页待处理`)),h('p',{className:'de-muted'},'以上为当前状态；以下为已保存的过程事件。'),h(IndexTrace,{events:doc.indexTrace})))
  }
  function RetrievalTrace({trace,value,openEvidence}) {
    const [selected,setSelected]=useState(null)
    const rows=(trace.results??[]).flatMap(doc=>doc.hits.map((hit,i)=>({...hit,id:doc.documentId,name:doc.name,rank:i+1})))
    const active=rows.find(r=>`${r.id}:${r.page}`===selected)??rows[0]
    const read=active&&(trace.reads??[]).find(r=>r.documentId===active.id&&r.page===active.page)
    const evidence=active&&value?.evidence?.find(e=>e.id===active.id&&e.page===active.page)
    const status=read?.omitted?'预算未发送':read&&read.quality!=='readable'?'需要读图':evidence?.previouslyReturned?'本轮已提供':evidence?.text?'原文已送达':read?'已读取':'候选，尚未读取'
    return h('details',{className:'de-retrieval'},h('summary',null,'检索过程'),
      h('ol',{className:'de-stages'},h('li',null,`候选 ${trace.candidatePages??rows.length} 页`),h('li',null,`读取 ${trace.reads?.length??0} 页`),h('li',null,`重复 ${trace.repeatedPages??0} 个片段`)),
      h('p',{className:'de-muted'},`${trace.modelBytes??0} 字节工具输出 · 不等于 token 数`),
      (trace.results??[]).map(doc=>h('details',{key:doc.documentId,open:true},h('summary',null,doc.name),h('div',{className:'de-row'},doc.hits.map((hit,i)=>h('button',{key:hit.page,'aria-pressed':active?.id===doc.documentId&&active.page===hit.page,onClick:()=>setSelected(`${doc.documentId}:${hit.page}`)},`${i+1} · p.${hit.page}`))))),
      active&&h('section',{className:'de-selected','aria-live':'polite'},h('div',{className:'de-row spread'},h('strong',null,`p.${active.page} · ${status}`),h('button',{onClick:()=>openEvidence(active.id,active.page,evidence?.citation?new URL(evidence.citation).searchParams.get('quote')??'':'')},'打开原页')),
        read&&h('p',{className:'de-muted'},`原文 ${read.sourceTextChars} 字符 · 本次提取 ${read.sentTextChars??0} 字符${evidence?.previouslyReturned?'，重复片段未重发':''}`),
        h('p',null,evidence?.text??active.excerpt??(evidence?.previouslyReturned?'请查看本轮前次已送达的原文。':'此候选没有文字摘录。'))))
  }
  function EvidenceTool({ block, toolName, inspect, openEvidence, openDocuments }) {
    const settled = block.kind === 'tool-result'
    const call = settled ? block.call : block
    let args = {}, value
    try { args = JSON.parse(call?.argsRaw ?? '{}') ?? {} } catch {}
    const text = settled ? (block.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n') : ''
    try { value = JSON.parse(text) } catch {}
    if (toolName === 'library_list' && block.meta?.documentEvidence?.catalog) value = block.meta.documentEvidence.catalog
    const trace = block.meta?.documentEvidence?.trace
    const titles = { library_list: '查看文档索引', library_search: '检索文档', library_retrieve: '检索并读取证据', library_expand: '补读原文与邻页', library_read_page: '读取原页', library_cite: '定位引用' }
    const state = !settled ? '进行中' : block.isError ? '失败' : '完成'
    const duration = settled && block.callTime != null ? ` · ${Math.max(0, block.time - block.callTime) / 1000} 秒` : ''
    const pageLink = (id, page, label, quote) => h('button', { type: 'button', onClick: () => openEvidence(id, page, quote) }, label)
    return h('details', { className: 'de-tool', 'data-evidence-tool': toolName },
      h('summary', null, `${titles[toolName] ?? toolName} · ${state}${duration}${args.query ? ' · ' + args.query : ''}${args.page ? ' · p.' + args.page : ''}`),
      !settled && h('p', { role: 'status' }, '正在执行，结果将自动更新…'),
      settled && block.isError && h('p', { className: 'de-error', role: 'alert' }, text || '工具执行失败，请查看原始轨迹。'),
      settled && !block.isError && !value && h('p', null, '此历史结果无法解析，请查看原始轨迹。'),
      !block.isError && toolName === 'library_list' && value?.documents && h('div', null,
        h('p', null, `${value.documents.length} 份资料 · 本会话选中 ${value.selected?.length ?? 0} 份`),
        value.documents.map(doc => h('section', { className: 'de-card', key: doc.id },
          h('strong', null, doc.name),
          h('p', { className: 'de-muted' }, `${labels[doc.status] ?? doc.status} · 文字 ${doc.coverage?.indexedPages}/${doc.coverage?.totalPages} 页 · 视觉 ${doc.coverage?.visualNotedPages} 页`),
          h(IndexTrace, { events: block.meta?.documentEvidence?.documents?.find(item => item.id === doc.id)?.indexTrace ?? doc.indexTrace }),
          pageLink(doc.id, 1, '打开原文'))),
        h('button', { onClick: openDocuments }, '查看实时索引进度')),
      !block.isError && toolName === 'library_search' && value?.results && h('div', null,
        h('p', null, `复用索引 · 范围 ${value.selected?.length ?? value.results.length} 份 · 返回 ${value.results.reduce((n, doc) => n + (doc.hits?.length ?? 0), 0)} 个候选页`),
        value.results.map(doc => h('section', { className: 'de-card', key: doc.documentId },
          h('strong', null, doc.name),
          h('p', { className: 'de-muted' }, `文字覆盖 ${doc.coverage?.indexedPages}/${doc.coverage?.totalPages} 页 · 命中 ${doc.matchedPages ?? doc.hits?.length ?? 0} 页${doc.truncated ? ' · 返回已截断' : ''}`),
          doc.coverage?.partial && h('p', null, '索引尚未完成，结果仅覆盖已处理页面。'),
          !!(doc.coverage?.unreadLowTextPages?.length ?? doc.coverage?.visualGapPages) && h('p', null, `仍有 ${doc.coverage.unreadLowTextPages?.length ?? doc.coverage.visualGapPages} 个低文本页未建立视觉页卡。`),
          !(doc.hits?.length) && h('p', null, '未命中；不能据此判断资料中不存在答案。'),
          (doc.hits ?? []).slice(0, 12).map(hit => h('div', { className: 'de-hit', key: hit.page },
            pageLink(doc.documentId, hit.page, `p.${hit.page}`),
            !hit.previouslyReturned && h('span', { className: 'de-muted' }, ` 分数 ${Number(hit.score).toFixed(2)} · ${hit.source === 'text_layer' ? '文字层' : hit.source}`),
            h('p', null, hit.previouslyReturned ? '本轮已返回该摘录，模型上下文中不重复发送。' : hit.excerpt))),
          doc.hits?.length > 12 && h('p', { className: 'de-muted' }, '卡片显示前12个候选页，其余见原始轨迹。'))),
        h('p', { className: 'de-muted' }, '候选页需要进一步读取核对；检索分数不代表答案置信度。')),
      !block.isError && ['library_read_page', 'library_cite'].includes(toolName) && value && h('div', null,
        h('p', null, `${value.name ?? 'PDF'} · 物理第 ${value.page ?? args.page} 页`),
        h('p', { className: 'de-muted' }, toolName === 'library_read_page' ? (block.content?.some(part => part.type === 'image') ? '已提供原页图像和文字' : '已提供原页文字') : value.status === 'located_text' ? `文字定位成功 · ${value.matches?.length ?? 0} 处匹配；不代表语义验证` : '仅支持页级定位，请核对原页'),
        args.quote && h('blockquote', null, args.quote),
        pageLink(value.documentId ?? args.id, value.page ?? args.page, '打开原页', toolName === 'library_cite' ? args.quote : '')),
      !block.isError && ['library_retrieve', 'library_expand'].includes(toolName) && value && h('div', null,
        h('p', null, `范围 ${value.selected?.length ?? 0} 份 · 已读证据 ${value.evidence?.length ?? 0} 页 · 本地处理，无内部模型调用`),
        (value.documents ?? []).map(doc => h('p', { key: doc.id }, `${doc.name}：${({text_evidence:'已提供原文，需判断是否支持答案',no_match:'未命中，不能推断不存在',needs_vision:'文字不可用，需要读图',not_read_budget:'本次预算内尚未读取'})[doc.status] ?? doc.status}${doc.visualPages?.length ? ' · 待读图 p.' + doc.visualPages.join(', p.') : ''}`)),
        (value.next ?? []).map((next,i) => h('p', {key:'next-'+i, className:'de-muted'}, `后续取证：${({read_image:'查看原页图像',expand_one_page:'预算未容纳，请单页补读',expand_context_if_needed:'片段被截断，按需补读上下文',targeted_search:'按文档缩小范围继续检索'})[next.action] ?? next.action}${next.pages ? ' · p.' + next.pages.join(', p.') : ''}`)),
        (value.evidence ?? []).map(item => h('details', { className: 'de-card', key: `${item.id}/${item.page}` },
          h('summary', null, `${item.name ?? '已返回的证据'} · p.${item.page}`),
          pageLink(item.id, item.page, `p.${item.page}`, item.citation ? new URL(item.citation).searchParams.get('quote') ?? '' : ''),
          h('p', null, item.previouslyReturned ? '同一原文片段已在本轮提供，此次只返回引用。' : item.text),
          item.truncated && h('p', { className: 'de-muted' }, '此处仅提供相关片段；需要更多上下文时可打开原页。')))),
      trace && h(RetrievalTrace,{trace,value,openEvidence}),
      inspect && h('button' , { type: 'button', onClick: inspect }, '查看原始轨迹'))
  }
  function Library({ sessionId, useTabInfo, rpc }) {
    const { tab } = useTabInfo()
    const [state, setState] = useState(null)
    const [candidates, setCandidates] = useState([])
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [focusedId,setFocusedId] = useState(null)
    const [filter,setFilter] = useState('')
    const refresh = async () => setState(await rpc(sessionId, 'list', {}, tab.signal))
    const act = async (op, args) => {
      setBusy(true); setError('')
      try { await rpc(sessionId, op, args, tab.signal); await refresh() }
      catch (e) { if (!tab.signal.aborted) setError(e.message) }
      finally { setBusy(false) }
    }
    useEffect(() => {
      let active = true, timer
      const poll = async () => {
        try {
          const next = await rpc(sessionId, 'list', {}, tab.signal)
          if (active) { setState(next); timer = setTimeout(poll, next.documents.some(doc => doc.status === 'indexing') ? 1500 : 6000) }
        } catch (e) { if (active && !tab.signal.aborted) setError(e.message) }
      }
      poll()
      rpc(sessionId, 'discover', {}, tab.signal).then(value => { if (active) setCandidates(value.candidates) }).catch(e => { if (active) setError(e.message) })
      return () => { active = false; clearTimeout(timer) }
    }, [sessionId, tab.id])
    const open = doc => tab.actions.openResource(`dsh-resource://evidence/${doc.id}`, { params: { page: 1 } })
    const add = (args) => act('add', { ...args, confirmed: true })
    const uploads = state?.uploads.filter(ref => !state.documents.some(doc => doc.sourceAttachmentIds?.includes(ref.attachmentId))) ?? []
    const activeId = state?.documents.some(doc=>doc.id===focusedId)?focusedId:state?.selected[0]??state?.documents[0]?.id
    return h('div', { className: 'de-panel', 'data-document-library': true },
      h('div', { className: 'de-row spread' }, h('h2', null, '文档资料库'), h('button', { onClick: () => act('list', {}), disabled: busy }, '刷新')),
      h('p', { className: 'de-library-status' }, `项目共享 · ${state?.documents.length??0} 份文档 · 本会话选中 ${state?.selected.length??0} 份`),
      h('input',{className:'de-file-search',type:'search',placeholder:'搜索文档名称','aria-label':'搜索文档名称',value:filter,onChange:e=>setFilter(e.target.value)}),
      h('div',{className:'de-file-list'},state?.documents.filter(doc=>doc.name.toLowerCase().includes(filter.toLowerCase())).map(doc=>h('div',{className:'de-file-row',key:doc.id},
        h('input',{type:'checkbox','aria-label':`将 ${doc.name} 纳入本次检索`,checked:state.selected.includes(doc.id),disabled:busy,onChange:e=>act('select',{ids:e.target.checked?[...state.selected,doc.id]:state.selected.filter(id=>id!==doc.id)})}),
        h('button',{className:'de-file-select','aria-label':`查看 ${doc.name}`,'aria-pressed':activeId===doc.id,onClick:()=>setFocusedId(doc.id)},h('strong',null,doc.name),h('span',null,`${doc.coverage.totalPages} 页 · ${labels[doc.status]??doc.status}`))))),
      state && !state.documents.some(doc=>doc.name.toLowerCase().includes(filter.toLowerCase())) && filter && h('p',{className:'de-muted'},'没有匹配的文档。'),
      error && h('p', { className: 'de-error', role: 'alert' }, error),
      !state && !error && h('p', { role: 'status' }, '正在读取资料库…'),
      state?.documents.length === 0 && h('div', { className: 'de-empty' }, h('strong', null, '从一份 PDF 开始'), h('p', { className: 'de-muted' }, '上传 PDF 并发送消息，或从下方项目文件加入。确认后建立索引，处理期间也可以提问。')),
      state?.documents.filter(doc=>doc.id===activeId).map(doc => h('section', { className: 'de-document-detail', key: doc.id },
        h('div',{className:'de-section-title'},'文档详情'),
        h('strong',null,doc.name),
        h('p', { className: 'de-muted' }, `${labels[doc.status] ?? doc.status} · ${doc.coverage.indexedPages}/${doc.coverage.totalPages} 页文字 · ${doc.coverage.visualNotedPages} 页视觉`),
        doc.summary && h('p', null, doc.summary),
        h(DocumentStructure,{doc,openPage:page=>tab.actions.openResource(`dsh-resource://evidence/${doc.id}`,{params:{page}})}),
        doc.keywords?.length > 0 && h('p', { className: 'de-muted' }, doc.keywords.join(' · ')),
        h('details', null, h('summary', { className: 'de-muted' }, '文档信息'),
          h('p', { className: 'de-muted' }, `版本：${doc.version ?? '未知'} · 生效日期：${doc.effectiveDate ?? '未知'} · 适用范围：${doc.applicability ?? '未知'}`),
          h('p', { className: 'de-muted' }, `内容标识 ${doc.id.slice(0, 12)} · ${doc.summary ? '简介由模型整理，仅作检索线索' : '简介尚未生成'}`),
          h('p',{className:'de-muted'},'目录及页面导航见上方「目录与建立过程」。')),
        h('progress', { value: doc.coverage.indexedPages, max: doc.coverage.totalPages, 'aria-label': `${doc.name}文字索引进度` }),
        doc.coverage.unreadLowTextPages.length > 0 && h('p', { className: 'de-muted' }, `${doc.coverage.unreadLowTextPages.length} 页缺少视觉页卡；检索可能漏掉扫描内容。`),
        doc.error && h('p', { className: 'de-error' }, doc.error),
        h('div', { className: 'de-row' }, h('button', { onClick: () => open(doc) }, '打开 PDF'),
          doc.status === 'indexing' ? h('button', { disabled: busy, onClick: () => act('cancel', { id: doc.id }) }, '停止') : doc.status !== 'ready' && h('button', { disabled: busy, onClick: () => act('resume', { id: doc.id }) }, '继续索引')))),
      (uploads.length > 0 || candidates.length > 0) && h('details',{className:'de-pending'},h('summary',null,'添加资料'),
      uploads.map(ref => h('section', { className: 'de-card', key: ref.attachmentId }, h('strong', null, ref.name), h('p', { className: 'de-muted' }, '本次对话上传'), h('button', { className: 'de-primary', disabled: busy, onClick: () => add({ attachmentId: ref.attachmentId }) }, '确认加入并索引'))),
      candidates.map(file => h('section', { className: 'de-card', key: file.path }, h('strong', null, file.name), h('p', { className: 'de-muted' }, `${file.path} · ${(file.bytes / 1024 / 1024).toFixed(1)} MB`), h('button', { disabled: busy, onClick: () => add({ path: file.path }) }, '确认加入并索引')))),
      h('p', { className: 'de-muted' }, '视觉处理使用当前 dsh 模型配置。缺少视觉能力时保留文字索引并显示缺口。'))
  }
  function Pdf({ sessionId, useTabInfo, rpc }) {
    const { tab } = useTabInfo()
    const id = new URL(tab.contentId).pathname.slice(1)
    const navigation = tab.navigation
    const [page, setPage] = useState(navigation.params?.page ?? 1)
    const [data, setData] = useState(null)
    const [located, setLocated] = useState(null)
    const [error, setError] = useState('')
    const [zoom, setZoom] = useState(100)
    const viewport = useRef(null)
    const quote = navigation.params?.quote ?? ''
    useEffect(() => { setPage(navigation.params?.page ?? 1) }, [navigation.revision])
    useEffect(() => {
      const abort = new AbortController()
      const signal = AbortSignal.any([tab.signal, abort.signal])
      setError(''); setData(null); setLocated(null)
      Promise.all([rpc(sessionId, 'page', { id, page }, signal), quote && page === navigation.params?.page ? rpc(sessionId, 'locate', { id, page, quote }, signal) : null])
        .then(([image, regions]) => { if (!signal.aborted) { setData(image); setLocated(regions) } })
        .catch(e => { if (!signal.aborted) setError(e.message) })
      return () => abort.abort()
    }, [id, page, quote, navigation.revision, sessionId])
    useEffect(() => { if (data && viewport.current) viewport.current.querySelector('.de-region')?.scrollIntoView({ block: 'center' }) }, [data, located])
    const regions = located?.matches.flatMap(match => match.regions) ?? []
    return h('div', { className: 'de-panel', 'data-document-pdf': true },
      h('div', { className: 'de-toolbar' }, h('div', { className: 'de-row' },
        h('button', { onClick: () => setPage(Math.max(1, page - 1)), disabled: page <= 1 }, '上一页'),
        h('input', { type: 'number', min: 1, max: data?.totalPages, value: page, 'aria-label': '物理页码', onChange: e => { const n = Number(e.target.value); if (Number.isInteger(n) && n >= 1 && (!data || n <= data.totalPages)) setPage(n) } }),
        h('span', null, `/ ${data?.totalPages ?? '…'}`), h('button', { onClick: () => setPage(page + 1), disabled: !data || page >= data.totalPages }, '下一页'),
        h('button', { onClick: () => setZoom(Math.max(75, zoom - 25)), 'aria-label': '缩小' }, '−'), h('span', null, `${zoom}%`), h('button', { onClick: () => setZoom(Math.min(250, zoom + 25)), 'aria-label': '放大' }, '+'))),
      error && h('p', { className: 'de-error', role: 'alert' }, error),
      data && h('p', { className: 'de-muted' }, `${data.name} · 物理第 ${page} 页 · ${id.slice(0, 12)}`),
      located && h('p', { className: 'de-quote' }, located.status === 'located_text' ? `已高亮原文${located.matches.length > 1 ? `（匹配 ${located.matches.length} 处）` : ''}：${quote}` : `已跳到原页；未找到可靠文字坐标，请核对页面：${quote}`),
      !data && !error && h('p', { role: 'status' }, '正在打开原文…'),
      data && h('div', { className: 'de-view-scroll', ref: viewport }, h('div', { className: 'de-page', style: { width: `${zoom}%` } },
        h('img', { src: `data:image/png;base64,${data.pngBase64}`, alt: `${data.name}物理第${page}页` }),
        ...regions.map(([x0, y0, x1, y1], i) => h('span', { key: i, className: 'de-region', style: { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` } })))))
  }
  function apply(ctx) {
    const rpc = async (sessionId, operation, args, signal) => {
      const result = await ctx.connection.rpc.call('/api', 'documentEvidence/action', { sessionId, operation, args }, signal)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    }
    ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles + nativeStyles + libraryStyles; document.head.append(style); return () => style.remove() })
    let openResource, openLibrary
    if (ctx.get('sidebarRightTabs') && ctx.get('sidebarRight')) {
      ctx.effect(() => ctx.sidebarRightTabs.register({ id: LIBRARY, kind: 'document-library', title: () => '文档资料库', guide: [{ order: 30, title: () => '文档资料库', description: () => '加入 PDF、选择检索范围、查看索引进度' }] }))
      ctx.effect(() => ctx.sidebarRightTabs.register({ id: PDF, kind: 'document-pdf', patterns: ['dsh-resource://evidence/**'], title: () => 'PDF 原文' }))
      for (const [key, body] of [[LIBRARY, Library], [PDF, Pdf]]) ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key, inject: () => ({ rpc }) }, body)))
      openResource = (address, options) => ctx.sidebarRight.openResource(address, options)
      openLibrary = () => ctx.sidebarRight.openTab('document-library')
    } else {
      // npm alpha.2 exposes the details column; newer source adds sidebarRight.
      // Shadow its occupant only while documents are open; closing restores it.
      let disposePanel, view = { kind: 'library', revision: 0 }
      const listeners = new Set()
      const close = () => { disposePanel?.(); disposePanel = undefined; ctx.layout.closeDetails() }
      function Panel({ sessionId }) {
        const [current, setCurrent] = useState(view)
        const [floating, setFloating] = useState(false)
        const seat = useRef(null)
        const abort = useRef(new AbortController())
        useEffect(() => { const listener = () => setCurrent(view); listeners.add(listener); return () => { listeners.delete(listener); abort.current.abort() } }, [])
        useEffect(() => {
          const observer = new ResizeObserver(entries => setFloating(entries[0].contentRect.width < 280))
          if (seat.current) observer.observe(seat.current)
          return () => observer.disconnect()
        }, [])
        const tab = { id: `${sessionId}/documents`, contentId: current.address,
          signal: abort.current.signal, navigation: { params: current.params, revision: current.revision },
          actions: { openResource, openTab: openLibrary } }
        const props = { sessionId, useTabInfo: () => ({ tab }), rpc }
        const body = h('section', { 'aria-label': '文档侧栏', style: { height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0,
          ...(floating ? { position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(100vw, 520px)', background: 'var(--ds-bg-primary, #fff)', zIndex: 100, boxShadow: '-8px 0 30px #0002' } : {}) } },
          h('div', { className: 'de-panel de-row spread', style: { height: 'auto', flexShrink: 0, padding: '10px 14px' } },
            h('button', { onClick: openLibrary }, '资料库'), h('button', { onClick: close, 'aria-label': '关闭文档侧栏' }, '关闭')),
          h('div', { style: { flex: 1, minHeight: 0 } }, current.kind === 'pdf' ? h(Pdf, { ...props, key: `${sessionId}/pdf` }) : h(Library, { ...props, key: `${sessionId}/library` })))
        return h('div', { ref: seat, style: { width: '100%', height: '100%' } }, floating ? createPortal(body, document.body) : body)
      }
      const show = next => {
        view = { ...next, revision: view.revision + 1 }
        if (!disposePanel) disposePanel = ctx.slots.register({ name: 'details', priority: -20 }, Panel)
        for (const listener of listeners) listener()
        ctx.layout.openDetails()
      }
      openResource = (address, options) => show({ kind: 'pdf', address, params: options?.params })
      openLibrary = () => show({ kind: 'library' })
      ctx.effect(() => () => disposePanel?.())
    }
    for (const key of ['library_list', 'library_search', 'library_retrieve', 'library_expand', 'library_read_page', 'library_cite']) {
      ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview', key, inject: () => ({
          openDocuments: () => openLibrary(),
          openEvidence: (id, page, quote = '') => openResource(`dsh-resource://evidence/${id}`, { params: { page: Number(page), quote } }),
        }),
      }, EvidenceTool)))
    }
    function LibraryButton({ sessionId }) {
      const [pending, setPending] = useState(0)
      const [selectedCount,setSelectedCount] = useState(null)
      useEffect(() => {
        const abort = new AbortController()
        let timer, discovered = []
        const poll = async () => {
          try {
            const state = await rpc(sessionId, 'list', {}, abort.signal)
            if (abort.signal.aborted) return
            setSelectedCount(state.selected.length)
            const uploaded = state.uploads.filter(ref => !state.documents.some(doc => doc.sourceAttachmentIds?.includes(ref.attachmentId)))
            const large = discovered.filter(file => file.large && !state.documents.some(doc => doc.name === file.name))
            setPending(new Set([...uploaded.map(file => file.name), ...large.map(file => file.name)]).size)
            timer = setTimeout(poll, 6000)
          } catch { /* The full panel owns actionable error presentation. */ }
        }
        rpc(sessionId, 'discover', {}, abort.signal).then(result => { discovered = result.candidates; return poll() }).catch(() => poll())
        return () => { abort.abort(); clearTimeout(timer) }
      }, [sessionId])
      return h('button', {type:'button',className:'de-library-entry',onClick:openLibrary,'aria-label':'资料库',title:pending?`${pending} 份资料待加入`:'管理文档与本次检索范围'},h('span',null,'资料库'),selectedCount!=null&&h('span',{className:'de-library-count'},`${selectedCount} 份`),pending>0&&h('span',{'aria-label':`${pending} 份待加入`},'·'))
    }
    ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({ name: 'conversation.session.header.utilities', id: 'document-library', order: 40 }, LibraryButton)))
    ctx.effect(() => {
      const click = event => {
        const link = event.target.closest?.('a[href]')
        if (!link) return
        let url
        try { url = new URL(link.href) } catch { return }
        if (url.origin !== 'https://dsh-document-evidence.invalid') return
        const match = url.pathname.match(/^\/([a-f0-9]{64})\/([1-9][0-9]*)$/)
        if (!match) return
        event.preventDefault(); event.stopPropagation()
        openResource(`dsh-resource://evidence/${match[1]}`, { params: { page: Number(match[2]), quote: url.searchParams.get('quote') ?? '' } })
      }
      document.addEventListener('click', click, true)
      return () => document.removeEventListener('click', click, true)
    })
  }
  return { inject: ['slots', 'layout', 'connection'], apply }
} })
