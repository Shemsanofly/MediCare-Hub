interface PaymentMethodLogoProps {
  methodId: string;
  className?: string;
}

/**
 * Brand logo lockups for each payment method, rendered as self-contained
 * wordmarks/SVG (no external image assets). Colours follow each brand.
 */
export function PaymentMethodLogo({ methodId, className = '' }: PaymentMethodLogoProps) {
  const tile = `flex h-11 w-full items-center justify-center gap-1.5 rounded-md px-2 ${className}`;

  switch (methodId) {
    case 'mpesa':
      return (
        <div className={tile} style={{ backgroundColor: '#00A650' }}>
          <span className="text-sm font-extrabold tracking-wide text-white">M-PESA</span>
        </div>
      );

    case 'airtel':
      return (
        <div className={tile} style={{ backgroundColor: '#E40000' }}>
          <span className="text-sm font-extrabold lowercase text-white">
            airtel<span className="font-medium opacity-90"> money</span>
          </span>
        </div>
      );

    case 'mixx':
      return (
        <div className={tile} style={{ backgroundColor: '#0A1A3F' }}>
          <span className="text-sm font-extrabold" style={{ color: '#FFD200' }}>
            Mixx
          </span>
          <span className="text-[10px] font-medium text-white/90">by Yas</span>
        </div>
      );

    case 'halopesa':
      return (
        <div className={tile} style={{ backgroundColor: '#F36F21' }}>
          <span className="text-sm font-extrabold text-white">HaloPesa</span>
        </div>
      );

    case 'selcom':
      return (
        <div className={`${tile} border border-gray-200 bg-white`}>
          <span className="text-sm font-extrabold" style={{ color: '#1E3A8A' }}>
            Sel<span style={{ color: '#F36F21' }}>com</span>
          </span>
        </div>
      );

    case 'card':
      return (
        <div className={`${tile} border border-gray-200 bg-white`}>
          <span className="text-sm font-bold italic" style={{ color: '#1A1F71' }}>
            VISA
          </span>
          <span className="relative inline-flex items-center" aria-hidden>
            <span className="h-4 w-4 rounded-full" style={{ backgroundColor: '#EB001B' }} />
            <span
              className="-ml-2 h-4 w-4 rounded-full"
              style={{ backgroundColor: '#F79E1B', opacity: 0.9 }}
            />
          </span>
        </div>
      );

    case 'bank_transfer':
      return (
        <div className={tile} style={{ backgroundColor: '#475569' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden>
            <path d="M12 2 2 7v2h20V7L12 2Zm-7 9v7H3v2h18v-2h-2v-7h-2v7h-3v-7h-2v7H7v-7H5Z" />
          </svg>
          <span className="text-sm font-bold text-white">Bank</span>
        </div>
      );

    default:
      return (
        <div className={`${tile} bg-gray-100`}>
          <span className="text-sm font-bold text-gray-700">{methodId}</span>
        </div>
      );
  }
}

export default PaymentMethodLogo;
