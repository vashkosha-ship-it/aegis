"""AI-generated catalogue descriptions for administrator workflows."""

from app.services.deepseek_client import chat_completion


DESCRIPTION_SYSTEM_PROMPT = (
    "Ты редактор каталога библиотеки по кибербезопасности. "
    "Пиши на русском нейтрально и точно. Не выдумывай содержание, "
    "издательство, год, факты об авторе или обещания, которых нет "
    "во входных данных. Верни только описание."
)


async def generate_book_description(
    *, title: str, author: str, categories: list[str]
) -> str:
    """Create a concise catalogue description from trusted book metadata."""
    category_text = ", ".join(categories) if categories else "не указаны"
    prompt = (
        f"Название: {title}\nАвтор: {author or 'не указан'}\n"
        f"Категории: {category_text}\n\n"
        "Составь осторожное описание для карточки книги: "
        "2–4 предложения, до 700 знаков. Объясни предполагаемую тему и кому "
        "книга может быть полезна. Если по названию нельзя достоверно "
        "определить содержание, прямо используй формулировку "
        "«книга посвящена теме…» без конкретных утверждений."
    )
    result = await chat_completion(
        [{"role": "user", "content": prompt}],
        system_prompt=DESCRIPTION_SYSTEM_PROMPT,
        max_tokens=450,
        timeout=90.0,
    )
    cleaned = result.strip().strip('`').strip()
    if cleaned.lower().startswith("описание:"):
        cleaned = cleaned.split(":", 1)[1].strip()
    return cleaned[:2000]
