import { Request, Response, NextFunction } from 'express';

export const asyncHandler = <Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
};
