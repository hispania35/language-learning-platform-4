export default function Footer() {
  return (
    <footer className="flex-shrink-0 px-4 md:px-6 pt-4 text-center">
      <p className="text-xs text-muted-foreground font-ibm">
        Сайт разработан{" "}
        <a
          href="https://landingguru.ru"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          landingguru.ru
        </a>
      </p>
    </footer>
  );
}