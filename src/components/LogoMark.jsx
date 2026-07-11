function LogoMark({ size = "normal", className = "" }) {
  return (
    <span
      className={[
        "logoMark",
        size === "large" ? "logoMarkLarge" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <img src="/logo-telocambio.png" alt="TeLoCambio" />
    </span>
  );
}

export default LogoMark;