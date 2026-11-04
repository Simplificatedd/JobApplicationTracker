import { useEffect, useState } from "react";

// Phones are below Tailwind's md breakpoint (768px).
const PHONE_LAYOUT_QUERY = "(max-width: 767.98px)";

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
