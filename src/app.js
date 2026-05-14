import express from 'express';
import cors from 'cors';

/*imports de rotas*/
import testeRoutes from './routes/testeRoutes.js';
import userRoutes from './routes/userRoutes.js';
import livroRoutes from './routes/livroRoutes.js';
import trocaRoutes from './routes/trocaRoutes.js';
import notificacaoRoutes from './routes/notificacaoRoutes.js';

/*configurações*/
const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('TESTE API RODANDO');
  console.log('REQUISIÇÃO RECEBIDA');
});

/*Rotas do app*/
app.use('/api', testeRoutes);
app.use('/api', userRoutes);
app.use('/api', livroRoutes);
app.use('/api', trocaRoutes);
app.use('/api', notificacaoRoutes);

/* Rotas de IoT */
import iotRoutes from './routes/iotRoutes.js';
app.use('/api', iotRoutes);

export default app;
