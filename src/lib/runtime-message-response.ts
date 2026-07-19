export function requireRuntimeMessageResponse<TResponse>(
  messageType: string,
  response: unknown,
): TResponse {
  if (response === null || response === undefined) {
    throw new Error(`No runtime response for ${messageType}`);
  }

  return response as TResponse;
}
