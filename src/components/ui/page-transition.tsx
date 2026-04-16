"use client";

import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

const WORKFLOW_ORDER = ["inventory", "assess", "document", "submit"];

function getWorkflowIndex(pathname: string): number {
  for (let i = 0; i < WORKFLOW_ORDER.length; i++) {
    if (pathname.includes(`/${WORKFLOW_ORDER[i]}`)) return i;
  }
  return -1;
}

function computeDirection(prevPath: string, currPath: string): number {
  const prevIdx = getWorkflowIndex(prevPath);
  const currIdx = getWorkflowIndex(currPath);
  if (prevIdx >= 0 && currIdx >= 0 && prevIdx !== currIdx) {
    return currIdx > prevIdx ? 1 : -1;
  }
  return 0;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [prevPath, setPrevPath] = useState(pathname);

  let direction = 0;
  if (prevPath !== pathname) {
    direction = computeDirection(prevPath, pathname);
    setPrevPath(pathname);
  }

  const variants = {
    enter: (d: number) => ({
      x: d === 0 ? 0 : d > 0 ? 80 : -80,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (d: number) => ({
      x: d === 0 ? 0 : d > 0 ? -80 : 80,
      opacity: 0,
    }),
  };

  return (
    <AnimatePresence mode="wait" custom={direction} initial={false}>
      <motion.div
        key={pathname}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          x: { type: "spring", stiffness: 500, damping: 40, mass: 0.8 },
          opacity: { duration: 0.15 },
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
