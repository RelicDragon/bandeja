#!/bin/bash
cd Backend
npm run lint
npm run build
cd ../Frontend
npm run lint
npm run build
