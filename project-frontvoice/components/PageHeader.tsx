import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accentColor?: string;
  className?: string;
  tone?: 'auto' | 'light';
}

export default function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  accentColor = '#6366F1',
  className = '',
  tone = 'auto',
}: PageHeaderProps) {
  const eyebrowClass = tone === 'light' ? 'text-slate-800' : 'text-slate-800 dark:text-slate-100';
  const titleClass = tone === 'light' ? 'text-[#0F172A]' : 'text-[#0F172A] dark:text-slate-100';
  const descriptionClass = tone === 'light' ? 'text-slate-500' : 'text-slate-500 dark:text-slate-400';

  return (
    <div className={`relative pl-7 ${className}`}>
      <div
        className="absolute left-0 top-1 bottom-1 w-px opacity-60"
        style={{ backgroundImage: `linear-gradient(to bottom, ${accentColor}, transparent)` }}
      />
      <svg
        className="absolute -left-[5.5px] top-0 h-3 w-3 opacity-80"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{ color: accentColor }}
      >
        <path d="M12 0C12 0 12 10.5 24 12C24 12 12 13.5 12 24C12 24 12 13.5 0 12C0 12 12 10.5 12 0Z" />
      </svg>
      <div className={`mb-2 flex items-center gap-2 text-lg font-semibold ${eyebrowClass}`}>
        <Icon size={18} strokeWidth={2.4} />
        <span>{eyebrow}</span>
      </div>
      <h1 className={`break-words text-[28px] font-black leading-none sm:text-[32px] ${titleClass}`}>
        {title}
      </h1>
      <p className={`mt-2 text-sm font-medium ${descriptionClass}`}>{description}</p>
    </div>
  );
}
