import Link from "next/link";

import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { getBulkImageReferences } from "@/modules/catalog/import/product-images.service";
import { MockStorageBadge } from "../../catalogue/fields";
import { BulkImages } from "./bulk-images";

export const metadata = { title: "Bulk images" };

export default async function BulkImagesPage() {
  const staff = await requireStaffPage("catalog.write");
  const references = await getBulkImageReferences(staff);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/products" className="hover:underline">
            Products
          </Link>{" "}
          / Bulk images
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk images</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Images are matched to products by file name, resized in the browser and uploaded a few at
          a time. <MockStorageBadge show={isMockStorage()} />
        </p>
      </header>
      <BulkImages
        products={references.products}
        concurrency={references.concurrency}
        canPublish={references.canPublish}
        publishRequested={references.publishRequested}
      />
    </div>
  );
}
