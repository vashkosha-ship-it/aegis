"""User model — replaces frontend state.users / state.userProfiles / state.userXp / state.userStreaks."""
from datetime import datetime
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class UserRole(str, Enum):
    READER = "reader"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, name="user_role"), default=UserRole.READER, nullable=False
    )

    # Оформление, выбранное в настройках (для статистики в админке).
    ui_theme: Mapped[str | None] = mapped_column(String(8), nullable=True)
    ui_accent: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Экран выбора оформления при первом входе показан (выбрал или пропустил).
    appearance_onboarded: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )

    # Профиль (бывший userProfiles)
    full_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Аватар из готового набора (a01…a15). Загрузка своих фото отключена.
    avatar_preset: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # Подразделение (выбирается при регистрации)
    department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Отдел, которым человек руководит (назначает администратор). Руководитель
    # назначает отделу книги и видит, как сотрудники их читают.
    managed_department: Mapped[str | None] = mapped_column(String(64), nullable=True)
    profile_visibility: Mapped[str] = mapped_column(
        String(32), default="public", nullable=False, server_default="public"
    )

    # Геймификация (бывшие userXp / userStreaks)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak_last_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Онбординг (определение уровня кибербезопасности при первом входе)
    cyber_level: Mapped[str | None] = mapped_column(String(32), nullable=True)
    topic_scores: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Книги, которые человек убрал крестиком из блока «Продолжить». Хранится
    # в аккаунте, а не на устройстве: иначе убранная книга возвращалась на
    # другом устройстве, в приложении с экрана «Домой» или после очистки
    # данных браузера.
    resume_hidden: Mapped[list | None] = mapped_column(JSON, nullable=True)
    level_assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Смена email с подтверждением (G/SMTP)
    pending_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_change_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    email_change_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Подтверждение email при регистрации
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")
    verify_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verify_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Сброс пароля («забыли пароль»)
    reset_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reset_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Не используются после удаления второго фактора администратора. Поля
    # временно сохранены для совместимости с откатом на предыдущий релиз;
    # удалить их можно отдельной миграцией после стабилизационного периода.
    admin_mfa_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    admin_mfa_expires: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    admin_recovery_codes: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    # Согласия по 152-ФЗ. Отдельно: принятие Пользовательского соглашения и
    # Политики конфиденциальности, и согласие на обработку персональных
    # данных. legal_version — редакция документов, которую человек принял;
    # при новой редакции согласие запрашивается заново.
    terms_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    pd_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legal_version: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Одобрение аккаунта администратором (второй этап после подтверждения email)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    # Версия токенов: инкремент делает недействительными все ранее выданные
    # access/refresh токены (смена пароля, сброс пароля, выход со всех устройств).
    token_version: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, server_default="0"
    )
    # Пароль задал администратор (сброс): до смены пароля самим пользователем
    # доступна только смена пароля.
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Связи
    reading_progress: Mapped[list["ReadingProgress"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    mylist_entries: Mapped[list["MyListEntry"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    achievements: Mapped[list["UserAchievement"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    quiz_attempts: Mapped[list["QuizAttempt"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    daily_pages: Mapped[list["DailyPagesRead"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    annotations: Mapped[list["Annotation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} role={self.role.value}>"
