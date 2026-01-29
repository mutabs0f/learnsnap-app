import express, { type Express, Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // [FIX v2.9.8] Disable range requests to prevent RangeNotSatisfiableError
  app.use(express.static(distPath, {
    acceptRanges: false,
    maxAge: '1h',
    etag: true,
    lastModified: true,
  }));

  // [FIX v2.9.8] Handle RangeNotSatisfiableError gracefully
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.status === 416 || err.message?.includes('Range Not Satisfiable')) {
      console.warn(`[Static] Range error for ${req.originalUrl}, redirecting`);
      res.redirect(req.originalUrl);
      return;
    }
    next(err);
  });

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
