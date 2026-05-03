import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Check, CheckCircle2, Plus, Square } from 'lucide-react';

function tagClass(tag) {
  return tag === 'School' ? 'bg-[#68E083]/15 text-[#68E083]' : 'bg-[#8B5CF6]/18 text-[#B99AFF]';
}

export default function TodoList({ todos, focused = false }) {
  const completed = todos.filter((todo) => todo.done).length;
  const visibleTodos = todos.filter((todo) => !todo.done);

  return (
    <motion.div
      className={focused ? 'w-[560px]' : 'w-[405px]'}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className={`hairline rounded-[8px] bg-white/[0.025] px-6 py-6 ${focused ? 'shadow-softTeal' : ''}`}>
        <div className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={focused ? 25 : 21} strokeWidth={1.6} />
            <h2 className={focused ? 'text-[31px] font-thin' : 'text-[19px] font-light'}>To-Do</h2>
          </div>
          <button className="flex items-center gap-2 rounded-[6px] border border-white/14 px-3 py-2 text-[12px] text-primary" aria-label="Add task">
            <Plus size={16} strokeWidth={1.8} />
            Add task
          </button>
        </div>

        <div className="space-y-5">
          <AnimatePresence initial={false}>
            {visibleTodos.map((todo) => (
              <motion.div
                key={todo.id}
                className={focused ? 'grid grid-cols-[26px_1fr_auto_auto] items-center gap-4' : 'grid grid-cols-[22px_1fr_auto_auto] items-center gap-3'}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ duration: 0.25 }}
              >
                <Square size={focused ? 20 : 18} strokeWidth={1.4} className="text-tertiary" />
                <span className={focused ? 'min-w-0 truncate text-[18px] text-primary' : 'min-w-0 truncate text-[14px] text-primary'}>{todo.title}</span>
                <span className={`rounded-[5px] px-2 py-1 text-[11px] ${tagClass(todo.tag)}`}>{todo.tag}</span>
                <span className="flex items-center gap-2 text-[12px] text-secondary">
                  <CalendarDays size={14} strokeWidth={1.5} />
                  {todo.date}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {visibleTodos.length === 0 && (
            <motion.div
              className="flex items-center gap-3 py-4 text-secondary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Check size={19} strokeWidth={1.7} />
              <span className={focused ? 'text-[17px]' : 'text-[14px]'}>All tasks completed</span>
            </motion.div>
          )}
        </div>

        <div className="mt-7 flex items-center gap-4">
          <CheckCircle2 size={18} strokeWidth={1.5} className="text-tertiary" />
          <p className="shrink-0 text-[13px] text-secondary">
            {completed} of {todos.length} tasks completed
          </p>
          <div className="h-[3px] flex-1 rounded-full bg-white/15">
            <motion.div
              className="h-full rounded-full bg-mirror-teal"
              animate={{ width: `${(completed / todos.length) * 100}%` }}
              transition={{ duration: 0.45 }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
