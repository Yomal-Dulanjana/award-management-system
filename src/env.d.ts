/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    admin?: {
      adminId: string;
      email: string;
      name: string;
      exp: number;
      iat: number;
    };
  }
}
