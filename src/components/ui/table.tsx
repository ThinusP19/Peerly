import { ArrowRight } from "lucide-react";
import * as React from "react";

import { type ScrollEdges, scrollEdges } from "@/lib/scroll-edges";
import { cn } from "@/lib/utils";

/**
 * A table that scrolls sideways inside its own box when it is wider than the
 * screen, and says so. On a phone the columns people act on (a mark, a match
 * status, an account's actions) often start off-screen, so a fade marks each
 * edge with more beyond it and a line under the table points the way. The box
 * also takes keyboard focus while it scrolls, so arrow keys can move it.
 */
const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const boxRef = React.useRef<HTMLDivElement>(null);
    const [edges, setEdges] = React.useState<ScrollEdges>({ left: false, right: false });

    React.useEffect(() => {
      const box = boxRef.current;
      if (!box) return;
      const update = () =>
        setEdges((current) => {
          const next = scrollEdges(box);
          return next.left === current.left && next.right === current.right ? current : next;
        });
      update();
      box.addEventListener("scroll", update, { passive: true });
      // Rows load, columns hide at breakpoints and the window turns, so the
      // table's width changes long after the first render.
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
      observer?.observe(box);
      if (box.firstElementChild) observer?.observe(box.firstElementChild);
      return () => {
        box.removeEventListener("scroll", update);
        observer?.disconnect();
      };
    }, []);

    const scrolls = edges.left || edges.right;

    return (
      <div className="w-full">
        <div className="relative">
          <div
            ref={boxRef}
            className="w-full overflow-x-auto focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            tabIndex={scrolls ? 0 : undefined}
            role={scrolls ? "region" : undefined}
            aria-label={scrolls ? "Table, scrolls sideways" : undefined}
          >
            <table
              ref={ref}
              className={cn("w-full caption-bottom text-sm", className)}
              {...props}
            />
          </div>
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent transition-opacity",
              edges.left ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent transition-opacity",
              edges.right ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
        {edges.right ? (
          <p className="flex items-center justify-end gap-1.5 border-t px-5 py-2 text-xs text-muted-foreground sm:px-6">
            Scroll sideways for more columns
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </p>
        ) : null}
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-muted/50 [&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "px-4 py-3 text-left align-middle text-xs font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-4 py-3.5 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
