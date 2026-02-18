export const loggerPlugin = {
  onRequest({ request }: { request: Request }) {
    const url = new URL(request.url);
    console.log(`[api] ${request.method} ${url.pathname}`);
  }
};
