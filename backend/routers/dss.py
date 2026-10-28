from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from database import get_db_connection

router = APIRouter()
