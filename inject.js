window.addEventListener("message", (e) => {
  if (e.data.type !== "EP_REQ_REACT_INFO") return;
  const el = document.querySelector('[data-ep-temp="' + e.data.id + '"]');
  if (!el) return;
  
  let compName = null;
  let source = null;
  
  const key = Object.keys(el).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
  if (key) {
    let current = el[key];
    while (current) {
      if (!source && current._debugSource) {
        source = current._debugSource;
      }
      if (!compName && current.type && typeof current.type === "function" && current.type.name) {
        compName = current.type.name;
      }
      if (compName && source) break;
      current = current.return;
    }
  }
  
  window.postMessage({ type: "EP_RES_REACT_INFO", id: e.data.id, compName, source }, "*");
});
