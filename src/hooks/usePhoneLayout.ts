import { useEffect, useState } from "react";

// Phones are below Tailwind's md breakpoint. This is the exact query behind
// Tailwind's max-md: variant (and the phone rules in styles.css), so the
// JavaScript and CSS layouts agree at fractional widths such as 767.99px.
// Range syntax like (width < 768px) would be shorter but needs Safari 16.4.
export const PHONE_LAYOUT_QUERY = "not all and (min-width: 768px)";

export function usePhoneLayout() {
  const [isPhone, setIsPhone] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.(PHONE_LAYOUT_QUERY).matches),
  );

  useEffect(() => {
    const query = window.matchMedia?.(PHONE_LAYOUT_QUERY);
    if (!query) return;
    const update = () => setIsPhone(query.matches);
    // Catch a change between the first render and this subscription.
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isPhone;
}
