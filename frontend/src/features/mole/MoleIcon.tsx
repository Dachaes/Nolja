// 게임 목록과 실제 게임에서 공통으로 사용하는 두더지 SVG입니다.
export function MoleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="51" rx="28" ry="10" fill="var(--color-board)" />
      <ellipse cx="32" cy="49" rx="21" ry="7" fill="var(--color-grid)" />
      <circle cx="18" cy="23" r="7" fill="#a58b76" />
      <circle cx="46" cy="23" r="7" fill="#a58b76" />
      <path d="M14 48V32a18 18 0 0 1 36 0v16c-9 6-27 6-36 0" fill="#b49a84" />
      <ellipse cx="32" cy="40" rx="12" ry="9" fill="#e6d7c6" />
      <circle cx="25" cy="30" r="2.5" fill="var(--color-black)" />
      <circle cx="39" cy="30" r="2.5" fill="var(--color-black)" />
      <ellipse cx="32" cy="36" rx="4" ry="3" fill="#946d65" />
      <path
        d="M28 43q4 4 8 0"
        fill="none"
        stroke="var(--color-black)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
