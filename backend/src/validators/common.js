'use strict';
const { z } = require('zod');
const id = z.coerce.number().int().positive();
const idParam = z.object({ id });
const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
module.exports = { z, id, idParam, pagination };
