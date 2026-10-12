export class AppError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 502, message: string, public code = "error") {
    super(message);
  }
}
export const badRequest = (m: string) => new AppError(400, m, "bad_request");
export const unauthorized = (m = "Please log in.") => new AppError(401, m, "unauthorized");
export const forbidden = (m = "You do not have access to this.") => new AppError(403, m, "forbidden");
export const notFound = (m = "Not found.") => new AppError(404, m, "not_found");
export const conflict = (m: string, code = "conflict") => new AppError(409, m, code);
