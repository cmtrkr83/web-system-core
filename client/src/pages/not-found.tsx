import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background-full p-6">
      <Card className="mx-4 w-full max-w-md rounded-3xl border-border-button-default bg-background-primary-default shadow-sm">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-text-error-primary" />
            <h1 className="text-title-2-medium text-text-primary">404 Sayfa Bulunamadı</h1>
          </div>

          <p className="mt-4 text-body-regular text-text-secondary">
            Aradığınız sayfa bulunamadı.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
