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
  if (!params.title) throw new Error('ADD_TODO requires params.title');
  await addTodo(params);
  await refreshTodos();
  setScene('todo');
  setLastIntent('ADD_TODO');
  const responseSpeech = `Added ${params.title}, sir. Let us pretend this improves productivity.`;
  broadcastAction('ADD_TODO', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { title: params.title } };
}

export async function handleCheckTodo(params = {}, speech = '') {
  if (!params.title) throw new Error('CHECK_TODO requires params.title');
  await checkTodo(params);
  await refreshTodos();
  setScene('todo');
  setLastIntent('CHECK_TODO');
  const responseSpeech = `Checked off ${params.title}, sir. Progress has been detected.`;
  broadcastAction('CHECK_TODO', {}, responseSpeech);
  return { ok: true, speech: responseSpeech, data: { title: params.title } };
}

function todoSpeech(todos = []) {
  if (!todos.length) return 'No open tasks, sir. Either impressive or deeply suspicious.';
  const sample = todos.slice(0, 3).map((todo) => todo.title).join(', ');
  return `${todos.length} open tasks, sir: ${sample}.`;
}
