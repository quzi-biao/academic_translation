import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all prompt styles
router.get('/', async (req, res) => {
  try {
    const styles = await prisma.promptStyle.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(styles);
  } catch (error) {
    console.error('Error fetching prompt styles:', error);
    res.status(500).json({ error: 'Failed to fetch prompt styles' });
  }
});

// Get single prompt style
router.get('/:id', async (req, res) => {
  try {
    const style = await prisma.promptStyle.findUnique({
      where: { id: req.params.id }
    });
    if (!style) {
      return res.status(404).json({ error: 'Prompt style not found' });
    }
    res.json(style);
  } catch (error) {
    console.error('Error fetching prompt style:', error);
    res.status(500).json({ error: 'Failed to fetch prompt style' });
  }
});

// Create new prompt style
router.post('/', async (req, res) => {
  const { name, isActive, imageModel, unifiedStyle, topicExploration, regionExploration, deepExploration, ttsSynthesis, pageDescription } = req.body;
  try {
    const newStyle = await prisma.promptStyle.create({
      data: {
        name,
        isActive: isActive ?? true,
        imageModel: imageModel || 'gpt-image-2',
        unifiedStyle: unifiedStyle || '',
        topicExploration: topicExploration || '',
        regionExploration: regionExploration || '',
        deepExploration: deepExploration || '',
        ttsSynthesis: ttsSynthesis || '',
        pageDescription: pageDescription || ''
      }
    });
    res.json(newStyle);
  } catch (error) {
    console.error('Error creating prompt style:', error);
    res.status(500).json({ error: 'Failed to create prompt style' });
  }
});

// Update prompt style
router.put('/:id', async (req, res) => {
  const { name, isActive, imageModel, unifiedStyle, topicExploration, regionExploration, deepExploration, ttsSynthesis, pageDescription } = req.body;
  try {
    const updatedStyle = await prisma.promptStyle.update({
      where: { id: req.params.id },
      data: {
        name,
        isActive,
        imageModel,
        unifiedStyle,
        topicExploration,
        regionExploration,
        deepExploration,
        ttsSynthesis,
        pageDescription
      }
    });
    res.json(updatedStyle);
  } catch (error) {
    console.error('Error updating prompt style:', error);
    res.status(500).json({ error: 'Failed to update prompt style' });
  }
});

// Delete prompt style
router.delete('/:id', async (req, res) => {
  try {
    await prisma.promptStyle.delete({
      where: { id: req.params.id }
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt style:', error);
    res.status(500).json({ error: 'Failed to delete prompt style' });
  }
});

export default router;
