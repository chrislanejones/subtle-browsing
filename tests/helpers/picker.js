// Reads the picker's UI, which lives in a closed shadow root that page
// scripts and Playwright locators can't see. The DevTools protocol can.

function textOf(node) {
  if (node.nodeType === 3) return node.nodeValue;
  return (node.children ?? []).map(textOf).join("");
}

function attrs(node) {
  const result = {};
  for (let i = 0; i < (node.attributes?.length ?? 0); i += 2) result[node.attributes[i]] = node.attributes[i + 1];
  return result;
}

function findAll(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) findAll(child, predicate, found);
  return found;
}

const sessions = new WeakMap();

// { hosts, shields, toasts, dialogs: [{ open, sections: { "Whole domain": [...], "Exact URL": [...] } }] }
export async function pickerUi(page) {
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const hosts = findAll(root, (n) => n.nodeName === "URL-BLOCKER-UI");
  const shadowChildren = hosts.flatMap((host) => host.shadowRoots?.[0]?.children ?? []);
  const byClass = (name) => shadowChildren.filter((n) => attrs(n).class === name);

  const dialogs = shadowChildren
    .filter((n) => n.nodeName === "DIALOG")
    .map((dialog) => {
      const sections = {};
      let heading = null;
      for (const child of dialog.children ?? []) {
        if (child.nodeName === "H3") heading = textOf(child);
        if (child.nodeName === "UL" && heading) {
          sections[heading] = findAll(child, (n) => n.nodeName === "BUTTON").map(textOf);
        }
      }
      return { open: "open" in attrs(dialog), sections };
    });

  return {
    hosts: hosts.length,
    shields: byClass("shield").length,
    toasts: byClass("toast").map(textOf),
    dialogs,
  };
}
