"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { HelpCircle, ChevronDown, Search } from "lucide-react";
import { useLocaleStore } from "@/stores/locale-store";
import { tx } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
}

export default function FaqPage() {
  const { locale } = useLocaleStore();
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/faq")
      .then(async (r) => { if (r.ok) setFaqs(await r.json()); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = faqs.filter((f) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return f.question.toLowerCase().includes(s) || f.answer.toLowerCase().includes(s) || f.category.toLowerCase().includes(s);
  });

  const categories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];

  return (
    <div className="max-w-[800px] mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold text-gray-900 tracking-tight">FAQ</h1>
        <p className="text-[13px] text-gray-500 mt-1">{tx(locale, "Frequently Asked Questions", "자주 묻는 질문", "よくある質問")}</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={tx(locale, "Search FAQ...", "FAQ 검색...", "FAQ検索...")}
          className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-[13px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-text-tertiary text-body-sm">{tx(locale, "Loading...", "로딩 중...", "読み込み中...")}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <HelpCircle size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-[14px] text-gray-400">{search ? tx(locale, "No results", "검색 결과가 없습니다", "結果なし") : tx(locale, "No FAQs yet", "FAQ가 없습니다", "FAQがありません")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((faq) => {
            const isOpen = openId === faq.id;
            return (
              <motion.div key={faq.id} layout className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button onClick={() => setOpenId(isOpen ? null : faq.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50/50 transition-colors">
                  <HelpCircle size={16} className="text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">{faq.question}</p>
                    {faq.category && <span className="text-[10px] text-gray-400">{faq.category}</span>}
                  </div>
                  <ChevronDown size={16} className={cn("text-gray-400 transition-transform shrink-0", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="overflow-hidden">
                    <div className="px-5 pb-4 pl-12">
                      <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">{faq.answer}</p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
