import React, { Suspense } from 'react';

type InstitutionalLottieProps = {
  label: string;
  src?: string;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  fallback?: React.ReactNode;
};

/**
 * Componente preparado para fase futura com Lottie real.
 * No MVP atual, o projeto roda sem dependências externas e usa SVG/CSS leve.
 * Quando a stack migrar para React/Next, instalar um player Lottie compatível
 * e carregar os assets sob demanda, respeitando prefers-reduced-motion.
 */
export default function InstitutionalLottie({
  label,
  src,
  loop = true,
  autoplay = true,
  className = '',
  fallback = null,
}: InstitutionalLottieProps) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!src || reduced) {
    return <div className={className} role="img" aria-label={label}>{fallback}</div>;
  }

  return (
    <Suspense fallback={<div className={className} aria-label={label}>{fallback}</div>}>
      <div
        className={className}
        role="img"
        aria-label={label}
        data-lottie-src={src}
        data-loop={String(loop)}
        data-autoplay={String(autoplay)}
      >
        {fallback}
      </div>
    </Suspense>
  );
}
