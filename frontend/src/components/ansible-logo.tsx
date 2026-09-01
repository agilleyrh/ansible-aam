type Props = {
  title?: string;
};

export function AnsibleLogo({ title = "Ansible" }: Props) {
  return (
    <svg className="aam-ansible-logo" viewBox="0 0 32 32" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="16" cy="16" r="16" fill="#151515" />
      <circle cx="16" cy="9.2" r="2.9" fill="#ffffff" />
      <path fill="#ffffff" d="M16 12.55 8.2 26.2h3.7L16 16.85l4.1 9.35h3.7z" />
    </svg>
  );
}
