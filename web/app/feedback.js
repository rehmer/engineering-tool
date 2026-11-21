// Feedback dialog: bug reports, suggestions and questions, sent to the form service in config.js.
import { FEEDBACK_ENDPOINT, SITE_NAME } from "./config.js";
import { esc } from "./format.js";

let dlg;

function build() {
  dlg = document.createElement("dialog");
  dlg.id = "fb-dlg";
  dlg.innerHTML = `<form method="dialog" id="fb-form">
    <h2>Send feedback</h2>
    <p class="note">Report a bug, suggest a change or ask a question. It goes privately to the site owner.</p>
    <label>Type<select name="type"><option>Bug or wrong result</option><option>Suggestion</option><option>Question</option><option>Other</option></select></label>
    <label>Message<textarea name="message" required minlength="5" rows="5" placeholder="What happened, what you expected, or what you'd like to see."></textarea></label>
    <label>Your email (optional, for a reply)<input name="email" type="email" autocomplete="email"></label>
    <label class="check"><input type="checkbox" name="withInputs" checked> Include this page's inputs and results so the issue can be reproduced</label>
    <input name="_gotcha" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
    <div class="fb-msg" id="fb-msg" role="status"></div>
    <div class="actions">
      <span class="note" id="fb-ctx"></span><span class="spacer" style="flex:1"></span>
      <button class="ibtn" value="cancel" formnovalidate>Close</button>
      <button class="ibtn primary" id="fb-send" value="send">Send</button>
    </div>
  </form>`;
  document.body.appendChild(dlg);
}

/** ctx: { page, tool, toolVersion, engineVersion, inputs, headline } */
export function openFeedback(ctx) {
  if (!dlg) build();
  const form = dlg.querySelector("form"), msg = dlg.querySelector("#fb-msg"), send = dlg.querySelector("#fb-send");
  msg.textContent = ""; msg.className = "fb-msg"; send.disabled = false; send.textContent = "Send";
  dlg.querySelector("#fb-ctx").textContent = ctx.tool ? `${ctx.tool} v${ctx.toolVersion}` : ctx.page;
  form.onsubmit = async (e) => {
    if (e.submitter?.value !== "send") return;
    e.preventDefault();
    if (!form.reportValidity()) return;
    const fd = Object.fromEntries(new FormData(form));
    if (fd._gotcha) { dlg.close(); return; }
    const payload = {
      _subject: `${SITE_NAME} feedback: ${fd.type}${ctx.tool ? ` (${ctx.tool})` : ""}`,
      type: fd.type, message: fd.message, email: fd.email || undefined,
      page: ctx.page, tool: ctx.tool || "", toolVersion: ctx.toolVersion || "", engineVersion: ctx.engineVersion,
      inputs: fd.withInputs ? JSON.stringify(ctx.inputs ?? null) : "not included",
      result: fd.withInputs ? ctx.headline || "" : "not included",
      browser: navigator.userAgent,
    };
    if (!FEEDBACK_ENDPOINT) {
      const text = Object.entries(payload).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join("\n");
      try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
      msg.className = "fb-msg warn";
      msg.innerHTML = `Feedback isn't connected on this copy of the site yet. Your report has been copied to the clipboard.`;
      return;
    }
    send.disabled = true; send.textContent = "Sending…";
    try {
      const res = await fetch(FEEDBACK_ENDPOINT, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      form.reset();
      msg.className = "fb-msg ok"; msg.textContent = "Thanks, your feedback was sent.";
      send.textContent = "Sent";
      setTimeout(() => dlg.open && dlg.close(), 1800);
    } catch (err) {
      send.disabled = false; send.textContent = "Send";
      msg.className = "fb-msg bad"; msg.textContent = `Couldn't send (${esc(err.message)}). Check your connection and try again.`;
    }
  };
  dlg.showModal();
  form.message.focus();
}
