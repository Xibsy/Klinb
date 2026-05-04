from pathlib import Path

import sqlalchemy as sql
import sqlalchemy.orm as orm
from sqlalchemy.orm import Session

MISSING = object()

SqlAlchemyBase = orm.declarative_base()

__factory: orm.sessionmaker | object = MISSING


def init(db_file: Path) -> None:
    global __factory

    if __factory is not MISSING:
        return

    db_file.parent.mkdir(parents=True, exist_ok=True)

    conn_str = f'sqlite:///{db_file}?check_same_thread=False'

    engine = sql.create_engine(conn_str, echo=False)
    __factory = orm.sessionmaker(bind=engine, expire_on_commit=False)

    import data.__all_models

    SqlAlchemyBase.metadata.create_all(engine)


def create_session() -> Session:
    global __factory
    return __factory()