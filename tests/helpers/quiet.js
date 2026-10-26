// Playwright's page.evaluate() and $eval() run with a user gesture, which
// gives the frame user activation. The autoplay stopper and the heavy ad
// remover both exempt frames the user interacted with, so a test that
// inspects a page with evaluate() switches those features off for it.
//
// quietEval() reads state through the DevTools protocol instead, without a
// user gesture. It works on a page (its main frame) or on a cross-site
// iframe (which runs in its own process and gets its own session).

const sessions = new WeakMap();

async function sessionFor(target) {
  let session = sessions.get(target);
  if (!session) {
    const page = typeof target.page === "function" ? target.page() : target;
    session = await page.context().newCDPSession(target);
    sessions.set(target, session);
  }
  return session;
}

export async function quietEval(target, fn, arg) {
  const session = await sessionFor(target);
  const { result, exceptionDetails } = await session.send("Runtime.evaluate", {
    expression: `(${fn})(${arg === undefined ? "" : JSON.stringify(arg)})`,
    returnByValue: true,
    awaitPromise: true,
    userGesture: false,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  }
  return result.value;
}
