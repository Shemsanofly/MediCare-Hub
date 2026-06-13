interface AdminDetailModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const AdminDetailModal = ({
  title,
  open,
  onClose,
  children,
  actions,
}: AdminDetailModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4 px-6 py-5">{children}</div>
        {actions && (
          <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDetailModal;
