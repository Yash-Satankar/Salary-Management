import { employeeListQuerySchema, importQuerySchema } from '@acme/shared';
import { Router } from 'express';
import multer from 'multer';
import { validationError } from '../../lib/errors';
import { sendData } from '../../lib/http';
import { validate } from '../../middleware/validate';
import type { EmployeeExporter } from './export';
import { ImportFileError } from './import-parser';
import type { ImportService } from './import-service';

export const CSV_IMPORT_PATH = '/employees/import';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function csvRoutes(importService: ImportService, exporter: EmployeeExporter): Router {
  const router = Router();
  // Memory storage: files are capped at 5 MB and parsed immediately, never written to disk.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  router.get(
    '/employees/export.csv',
    validate({ query: employeeListQuerySchema }, async ({ query }, _req, res) => {
      const { filename, stream } = await exporter.export(query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      stream.pipe(res);
    }),
  );

  router.post(
    CSV_IMPORT_PATH,
    upload.single('file'),
    validate({ query: importQuerySchema }, async ({ query }, req, res) => {
      if (!req.file) {
        throw validationError(undefined, 'Attach a CSV file in the "file" field');
      }
      try {
        const result = await importService.run(req.file.buffer.toString('utf8'), {
          dryRun: query.dryRun,
        });
        sendData(res, result);
      } catch (error) {
        throw error instanceof ImportFileError ? validationError(undefined, error.message) : error;
      }
    }),
  );

  return router;
}
