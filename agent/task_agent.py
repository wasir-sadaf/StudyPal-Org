import json
import os
from typing import Any, Dict, List, Optional

import requests
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI


TASK_SYSTEM_PROMPT = """You are the StudyPal Task Agent.

Your job is to turn a project idea into a small set of actionable tasks.

Use only the create_task tool.

Behavior rules:
1. If the user gives you a project idea, break it into a practical sequence of small tasks.
2. Create the tasks in a sensible order from setup to finishing steps.
3. Keep the tasks short, clear, and easy to execute.
4. If the request is too vague to plan responsibly, ask one short clarification and do not create tasks yet.
5. Keep the final answer concise and useful.
"""


def _normalize_auth_header(auth_token: str | None) -> Dict[str, str]:
    if not auth_token:
        return {}
    if auth_token.startswith('Bearer '):
        return {'Authorization': auth_token}
    return {'Authorization': f'Bearer {auth_token}'}


def _safe_json_response(response: requests.Response) -> Dict[str, Any]:
    payload = response.json()
    if isinstance(payload, dict) and isinstance(payload.get('data'), dict):
        return payload['data']
    return payload if isinstance(payload, dict) else {'raw': payload}


def build_task_tools(api_base_url: str, auth_token: str | None):
    headers = _normalize_auth_header(auth_token)
    base_url = api_base_url.rstrip('/')

    @tool
    def create_task(
        title: str,
        description: str = '',
        status: str = 'todo',
        priority: str = 'medium',
        due_date: str | None = None,
        category: str = '',
    ) -> Dict[str, Any]:
        """Create one task from a project plan. Use this repeatedly to build the whole project backlog."""
        body: Dict[str, Any] = {
            'title': title,
            'description': description,
            'status': status,
            'priority': priority,
            'category': category,
        }
        if due_date:
            body['due_date'] = due_date

        response = requests.post(f'{base_url}/api/tasks', json=body, headers=headers, timeout=20)
        response.raise_for_status()
        payload = _safe_json_response(response)
        return {'task': payload.get('task', payload)}

    return [create_task]


class TaskAgent:
    def __init__(self) -> None:
        self.api_base_url = os.getenv('API_BASE_URL', 'http://localhost:5000')
        self.openai_api_key = os.getenv('OPENAI_API_KEY', '')
        self.openai_model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')

    def run(self, message: str, auth_token: str | None = None, history: Optional[List[Dict[str, str]]] = None) -> Dict[str, Any]:
        if not self.openai_api_key:
            return {
                'reply': 'OPENAI_API_KEY is not configured, so the task agent cannot create project tasks yet.',
                'created_tasks': [],
            }

        tools = build_task_tools(self.api_base_url, auth_token)
        tools_by_name = {tool_item.name: tool_item for tool_item in tools}
        llm = ChatOpenAI(model=self.openai_model, temperature=0.2, api_key=self.openai_api_key)
        llm_with_tools = llm.bind_tools(tools)

        messages: List[Any] = [
            SystemMessage(content=TASK_SYSTEM_PROMPT),
        ]

        for turn in history or []:
            role = turn.get('role')
            content = str(turn.get('content', '')).strip()
            if not content:
                continue
            if role == 'assistant':
                messages.append(AIMessage(content=content))
            else:
                messages.append(HumanMessage(content=content))

        messages.append(HumanMessage(content=message.strip()))

        created_tasks: List[Dict[str, Any]] = []

        for _ in range(6):
            response = llm_with_tools.invoke(messages)
            messages.append(response)

            tool_calls = getattr(response, 'tool_calls', None) or []
            if not tool_calls:
                reply = response.content if isinstance(response.content, str) else str(response.content or '')
                return {
                    'reply': reply.strip(),
                    'created_tasks': created_tasks,
                }

            for tool_call in tool_calls:
                tool_name = tool_call.get('name')
                tool_args = tool_call.get('args') or {}
                tool_id = tool_call.get('id')
                tool_fn = tools_by_name.get(tool_name)

                if tool_fn is None:
                    continue

                tool_result = tool_fn.invoke(tool_args)
                if tool_name == 'create_task':
                    task = tool_result.get('task') if isinstance(tool_result, dict) else tool_result
                    if isinstance(task, dict):
                        created_tasks.append(task)

                content = json.dumps(tool_result, ensure_ascii=False) if isinstance(tool_result, (dict, list)) else str(tool_result)
                messages.append(ToolMessage(content=content, tool_call_id=tool_id))

        return {
            'reply': 'I could not finish the task creation flow. Please try again with a shorter project description.',
            'created_tasks': created_tasks,
        }