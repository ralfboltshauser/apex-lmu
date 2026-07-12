import { useRef, type AnchorHTMLAttributes, type PropsWithChildren } from "react";

type MagneticLinkProps = PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>>;

export function MagneticLink({ children, className = "", ...props }: MagneticLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const frame = useRef(0);

  const move = (event: React.PointerEvent<HTMLAnchorElement>) => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const node = ref.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const x = (event.clientX - box.left - box.width / 2) * 0.12;
    const y = (event.clientY - box.top - box.height / 2) * 0.16;
    window.cancelAnimationFrame(frame.current);
    frame.current = window.requestAnimationFrame(() => {
      node.style.setProperty("--mag-x", `${x.toFixed(2)}px`);
      node.style.setProperty("--mag-y", `${y.toFixed(2)}px`);
    });
  };

  const reset = () => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty("--mag-x", "0px");
    node.style.setProperty("--mag-y", "0px");
  };

  return (
    <a
      ref={ref}
      className={`magnetic ${className}`}
      onPointerMove={move}
      onPointerLeave={reset}
      {...props}
    >
      <span className="magnetic__content">{children}</span>
    </a>
  );
}
