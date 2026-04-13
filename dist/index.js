import { ref as s } from "vue";
function d(l) {
  const o = s(null), n = s(!1), e = s(null);
  async function i(a) {
    if (!a)
      return e.value = { type: "invalid-input", message: "containerUrl is required" }, null;
    n.value = !0, e.value = null;
    try {
      const t = await l(a, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: ""
      });
      if (!t.ok)
        return e.value = { type: "http", status: t.status, message: `HTTP ${t.status}` }, null;
      const r = t.headers.get("Location");
      if (!r)
        return e.value = { type: "missing-location", message: "TwinPod did not return a Location header" }, null;
      const u = new URL(r, a).href;
      return o.value = u, u;
    } catch (t) {
      return e.value = { type: "network", message: t.message }, null;
    } finally {
      n.value = !1;
    }
  }
  return { noteUri: o, loading: n, error: e, createNote: i };
}
export {
  d as useTwinPodNoteCreate
};
