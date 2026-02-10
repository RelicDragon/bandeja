-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PriceCurrency" ADD VALUE 'USD';
ALTER TYPE "PriceCurrency" ADD VALUE 'GBP';
ALTER TYPE "PriceCurrency" ADD VALUE 'JPY';
ALTER TYPE "PriceCurrency" ADD VALUE 'CNY';
ALTER TYPE "PriceCurrency" ADD VALUE 'CHF';
ALTER TYPE "PriceCurrency" ADD VALUE 'CAD';
ALTER TYPE "PriceCurrency" ADD VALUE 'AUD';
ALTER TYPE "PriceCurrency" ADD VALUE 'NZD';
ALTER TYPE "PriceCurrency" ADD VALUE 'SEK';
ALTER TYPE "PriceCurrency" ADD VALUE 'NOK';
ALTER TYPE "PriceCurrency" ADD VALUE 'DKK';
ALTER TYPE "PriceCurrency" ADD VALUE 'PLN';
ALTER TYPE "PriceCurrency" ADD VALUE 'CZK';
ALTER TYPE "PriceCurrency" ADD VALUE 'HUF';
ALTER TYPE "PriceCurrency" ADD VALUE 'RON';
ALTER TYPE "PriceCurrency" ADD VALUE 'BGN';
ALTER TYPE "PriceCurrency" ADD VALUE 'TRY';
ALTER TYPE "PriceCurrency" ADD VALUE 'INR';
ALTER TYPE "PriceCurrency" ADD VALUE 'BRL';
ALTER TYPE "PriceCurrency" ADD VALUE 'MXN';
ALTER TYPE "PriceCurrency" ADD VALUE 'SGD';
ALTER TYPE "PriceCurrency" ADD VALUE 'HKD';
ALTER TYPE "PriceCurrency" ADD VALUE 'KRW';
ALTER TYPE "PriceCurrency" ADD VALUE 'THB';
ALTER TYPE "PriceCurrency" ADD VALUE 'MYR';
ALTER TYPE "PriceCurrency" ADD VALUE 'IDR';
ALTER TYPE "PriceCurrency" ADD VALUE 'PHP';
