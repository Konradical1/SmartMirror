import { addTodo, checkTodo, getTodos } from '../services/notionService.js';
import { setLastIntent, setScene, updateContext } from '../state.js';
import { broadcastAction, broadcastData } from '../websocket.js';

export async function refreshTodos() {
  const todos = await getTodos();
  if (todos) {
    updateContext('todos', todos);
    broadcastData({ todos });
  }
  return todos;
}

export async function handleTodo(params = {}, speech = '') {
  const todos = await refreshTodos();
  setScene('todo');
  setLastIntent('SHOW_TODO');
  const responseSpeech = todoSpeech(todos);
  broadcastAction('SHOW_TODO', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { todos } };
}

export async function handleAddTodo(params = {}, speech = '') {
  const title = todoTitle(params);
  if (!title) throw new Error('ADD_TODO requires a todo title.');
  await addTodo({ ...params, title });
  await refreshTodos();
  setScene('todo');
  setLastIntent('ADD_TODO');
  const responseSpeech = `Added ${title}, sir. Let us pretend this improves productivity.`;
  broadcastAction('ADD_TODO', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { title } };
}

export async function handleCheckTodo(params = {}, speech = '') {
  const title = todoTitle(params);
  if (!title) throw new Error('CHECK_TODO requires a todo title.');
  const checked = await checkTodo({ ...params, title });
  if (!checked) throw new Error(`Could not find ${title} on your to-do list.`);
  await refreshTodos();
  setScene('todo');
  setLastIntent('CHECK_TODO');
  const responseSpeech = `Checked off ${title}, sir. Progress has been detected.`;
  broadcastAction('CHECK_TODO', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { title } };
}

function todoSpeech(todos = []) {
  if (!todos.length) return 'No open tasks, sir. Either impressive or deeply suspicious.';
  const sample = todos.slice(0, 3).map((todo) => todo.title).join(', ');
  return `${todos.length} open tasks, sir: ${sample}.`;
}

function todoTitle(params = {}) {
  return String(params.title || params.task || params.todo || params.item || params.text || params.name || '').trim();
}
