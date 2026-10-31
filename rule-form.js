import {
  addBlockedUrl,
  normalizeUrl,
  removeBlockedUrl,
  ruleLabel,
  rulePreview,
} from "./blocklist.js";

export function showUndo(status, message, undo) {
  status.replaceChildren(message, " ");
  const button = document.createElement("button");
  button.className = "btn btn-plain";
  button.textContent = "Undo";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await undo();
      status.textContent = "Undone. Reload if content was already removed.";
    } catch (error) {
      status.replaceChildren(error.message, " ", button);
      button.disabled = false;
    }
  });
  status.append(button);
}

// modeSlot puts the match select somewhere other than above the field;
// placeholders swaps the field's example to suit the chosen mode
export function mountRuleForm(input, button, status, options = {}) {
  const modes = document.createElement("label");
  modes.className = "rule-mode";
  modes.append("Match ");
  const select = document.createElement("select");
  select.id = "ruleMode";
  select.setAttribute("aria-label", "URL matching mode");
  for (const [value, label] of [
    ["domain", "Domain"],
    ["exact", "Exact URL"],
    ["pattern", "Advanced pattern"],
  ])
    select.add(new Option(label, value));
  modes.append(select);
  if (options.modeSlot) options.modeSlot.append(modes);
  else if (input.parentElement.classList.contains("toolbar"))
    input.before(modes);
  else input.parentElement.before(modes);
  const preview = document.createElement("p");
  preview.id = "rulePreview";
  preview.className = "row-desc rule-preview";
  preview.setAttribute("role", "status");
  input.setAttribute("aria-describedby", preview.id);
  input.parentElement.after(preview);
  const renderPreview = () => {
    try {
      preview.textContent = rulePreview(input.value, select.value);
    } catch (error) {
      preview.textContent = error.message;
    }
    preview.hidden = !input.value.trim();
    if (options.placeholders?.[select.value])
      input.placeholder = options.placeholders[select.value];
  };
  let revision = 0;
  const edited = () => {
    revision++;
    renderPreview();
  };
  select.addEventListener("change", edited);
  input.addEventListener("input", edited);
  renderPreview();
  const add = async () => {
    if (button.disabled || !input.value.trim()) return;
    button.disabled = true;
    const submittedRevision = revision;
    try {
      const value = normalizeUrl(input.value, select.value);
      const added = await addBlockedUrl(input.value, select.value);
      if (added) {
        // Storage notifications can arrive before the save reply. Keep the
        // next URL (and its match mode) if someone is already typing it.
        if (revision === submittedRevision) {
          input.value = "";
          renderPreview();
        }
        showUndo(status, `Blocked ${ruleLabel(value)}.`, () =>
          removeBlockedUrl(value),
        );
      } else status.textContent = "This URL is already blocked.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener("click", add);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  });
}
