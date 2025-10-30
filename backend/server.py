# Alternative campaign routes (frontend compatibility)
@app.post("/api/campaigns")
async def create_campaign_direct(campaign_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Alternative route to create campaign with auto-sheet creation"""
    try:
        logger.info(f"📥 Recebendo dados da campanha: {campaign_data}")
        
        # Verificar se tem sheet_id
        sheet_id = campaign_data.get('sheet_id') or campaign_data.get('sheetId')
        
        # ✅ SE NÃO TIVER SHEET_ID, CRIAR AUTOMATICAMENTE
        if not sheet_id:
            logger.info("📝 Nenhum sheet_id fornecido, criando sheet 'Geral' automaticamente...")
            
            with get_db() as conn:
                cursor = conn.cursor()
                
                # Criar sheet padrão
                new_sheet_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc)
                
                cursor.execute(
                    "INSERT INTO sheets (id, user_id, name, created_at, updated_at) VALUES (%s, %s, %s, %s, %s)",
                    (new_sheet_id, user_id, "Geral", now, now)
                )
                conn.commit()
                
                sheet_id = new_sheet_id
                logger.info(f"✅ Sheet criada automaticamente: {sheet_id}")
        
        # Verificar se a sheet existe e pertence ao usuário
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM sheets WHERE id = %s AND user_id = %s", (sheet_id, user_id))
            if not cursor.fetchone():
                logger.error(f"❌ Sheet {sheet_id} não encontrada para usuário {user_id}")
                raise HTTPException(status_code=404, detail="Sheet not found")
        
        # Criar campanha
        campaign_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        name = campaign_data.get('name', '')
        if not name:
            raise HTTPException(status_code=400, detail="Campaign name is required")
        
        start_date = campaign_data.get('start_date') or campaign_data.get('startDate')
        end_date = campaign_data.get('end_date') or campaign_data.get('endDate')
        status = campaign_data.get('status', 'active')
        industries = campaign_data.get('industries', [])
        # Converter datas se necessário
        if start_date and isinstance(start_date, str):
            try:
                start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except:
                start_date = None
        
        if end_date and isinstance(end_date, str):
            try:
                end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except:
                end_date = None
        
        # Converter industries para JSON
        industries_json = json.dumps(industries) if industries else '[]'
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO campaigns (id, user_id, sheet_id, name, start_date, end_date, status, industries, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (campaign_id, user_id, sheet_id, name, start_date, end_date, status, industries_json, now, now)
            )
            conn.commit()
        
        logger.info(f"✅ Campanha criada com sucesso: {campaign_id}")
        
        return {
            "id": campaign_id,
            "user_id": user_id,
            "sheet_id": sheet_id,
            "name": name,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "status": status,
            "industries": industries,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Erro ao criar campanha: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error creating campaign: {str(e)}")

@app.get("/api/campaigns/{campaign_id}")
async def get_campaign_direct(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    """Get campaign by ID"""
    try:
        with get_db() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT * FROM campaigns WHERE id = %s AND user_id = %s",
                (campaign_id, user_id)
            )
            campaign = cursor.fetchone()
            
            if not campaign:
                raise HTTPException(status_code=404, detail="Campaign not found")
            
            # Parse industries JSON
            if campaign['industries']:
                if isinstance(campaign['industries'], str):
                    campaign['industries'] = json.loads(campaign['industries'])
            else:
                campaign['industries'] = []
            
            # Convert datetime to ISO format
            if campaign.get('start_date'):
                campaign['start_date'] = campaign['start_date'].isoformat()
            if campaign.get('end_date'):
                campaign['end_date'] = campaign['end_date'].isoformat()
            if campaign.get('created_at'):
                campaign['created_at'] = campaign['created_at'].isoformat()
            if campaign.get('updated_at'):
                campaign['updated_at'] = campaign['updated_at'].isoformat()
            
            return dict(campaign)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting campaign: {str(e)}")

@app.put("/api/campaigns/{campaign_id}")
async def update_campaign_direct(campaign_id: str, campaign_data: dict, user_id: str = Depends(verify_license_middleware)):
    """Update campaign"""
    try:
        # Verificar se a campanha existe e pertence ao usuário
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, user_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Campaign not found")
        
        now = datetime.now(timezone.utc)
        
        # Campos a atualizar
        update_fields = []
        update_values = []
        
        if 'name' in campaign_data:
            update_fields.append("name = %s")
            update_values.append(campaign_data['name'])
        
        if 'start_date' in campaign_data:
            start_date = campaign_data['start_date']
            if isinstance(start_date, str):
                try:
                    start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                except:
                    start_date = None
            update_fields.append("start_date = %s")
            update_values.append(start_date)
        
        if 'end_date' in campaign_data:
            end_date = campaign_data['end_date']
            if isinstance(end_date, str):
                try:
                    end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                except:
                    end_date = None
            update_fields.append("end_date = %s")
            update_values.append(end_date)
        
        if 'status' in campaign_data:
            update_fields.append("status = %s")
            update_values.append(campaign_data['status'])
        
        if 'industries' in campaign_data:
            industries_json = json.dumps(campaign_data['industries'])
            update_fields.append("industries = %s")
            update_values.append(industries_json)
        
        update_fields.append("updated_at = %s")
        update_values.append(now)
        
        # Add campaign_id and user_id for WHERE clause
        update_values.extend([campaign_id, user_id])
        
        update_query = f"UPDATE campaigns SET {', '.join(update_fields)} WHERE id = %s AND user_id = %s"
        
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(update_query, update_values)
            conn.commit()
        
        # Buscar campanha atualizada
        return await get_campaign_direct(campaign_id, user_id)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating campaign: {str(e)}")

@app.delete("/api/campaigns/{campaign_id}")
async def delete_campaign_direct(campaign_id: str, user_id: str = Depends(verify_license_middleware)):
    """Delete campaign"""
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            
            # Verificar se existe
            cursor.execute("SELECT id FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, user_id))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Campaign not found")
            
            # Deletar clientes da campanha
            cursor.execute("DELETE FROM clients WHERE campaign_id = %s", (campaign_id,))
            
            # Deletar campanha
            cursor.execute("DELETE FROM campaigns WHERE id = %s AND user_id = %s", (campaign_id, user_id))
            conn.commit()
        
        return {"message": "Campaign deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting campaign: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting campaign: {str(e)}")
