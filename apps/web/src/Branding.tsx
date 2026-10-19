type BrandingProps = { className?: string; decorative?: boolean };

/** One shared reference to the approved SkillSetu logo artwork. */
export default function Branding({ className = '', decorative = false }: BrandingProps) {
  return (
    <img
      className={`skillsetu-logo ${className}`.trim()}
      src="/skillsetu-logo.png"
      alt={decorative ? '' : 'SkillSetu'}
      aria-hidden={decorative || undefined}
      draggable={false}
    />
  );
}
