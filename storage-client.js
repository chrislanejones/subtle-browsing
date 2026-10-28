// Every read-modify-write goes through the worker's single mutation queue.
export async function mutate(operation, data = {}) {
  const response = await chrome.runtime.sendMessage({
    action: "mutate",
    operation,
    data,
  });
  if (!response || response.error)
    throw new Error(
      response?.error ?? "The change could not be saved. Try again.",
    );
  return response.result;
}
