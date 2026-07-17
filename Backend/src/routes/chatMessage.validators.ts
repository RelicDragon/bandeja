import { body } from 'express-validator';

export const chatMessageLinkPreviewValidators = [
  body('linkPreviewUrl')
    .optional({ values: 'null' })
    .isString()
    .isLength({ max: 2048 })
    .withMessage('Invalid linkPreviewUrl'),
  body('linkPreviewToken')
    .optional({ values: 'null' })
    .isString()
    .isLength({ max: 32768 })
    .withMessage('Invalid linkPreviewToken'),
];
