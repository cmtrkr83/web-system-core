import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, Info, TriangleAlert } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const status = props.status ?? (props.variant === "destructive" ? "error" : "info")
        const StatusIcon = status === "success" ? CheckCircle2 : status === "warning" ? TriangleAlert : status === "error" ? TriangleAlert : Info
        return (
          <Toast key={id} {...props} status={status}>
            <StatusIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="grid min-w-0 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
            <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-[toast-countdown_3s_linear_forwards] bg-current opacity-30" aria-hidden="true" />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
